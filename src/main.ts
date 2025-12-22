import { Plugin, Modal, App } from 'obsidian';
import {
	VaultSizeSettingTab,
	VaultSizeSettings,
	DEFAULT_SETTINGS
} from './settings';

interface FileTypeStats {
	extension: string;
	count: number;
	totalSize: number;
}

interface VaultStats {
	totalSize: number;
	totalFiles: number;
	fileTypes: FileTypeStats[];
}

export default class VaultSizePlugin extends Plugin {
	public settings!: VaultSizeSettings;
	private statusBarItem!: HTMLElement;
	private updateTimeout: ReturnType<typeof setTimeout> | null = null;
	public cachedStats: VaultStats | null = null;

	async onload() {
		await this.loadSettings();

		// Settings tab
		this.addSettingTab(new VaultSizeSettingTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon('database', 'View vault size', () => {
			new VaultSizeModal(this.app, this).open();
		});

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText('Calculating…');
		this.statusBarItem.addClass('mod-clickable');
		this.statusBarItem.addEventListener('click', () => {
			new VaultSizeModal(this.app, this).open();
		});

		await this.updateVaultSize();

		// Vault change listeners
		this.registerEvent(this.app.vault.on('create', () => this.scheduleUpdate()));
		this.registerEvent(this.app.vault.on('delete', () => this.scheduleUpdate()));
		this.registerEvent(this.app.vault.on('modify', () => this.scheduleUpdate()));
		this.registerEvent(this.app.vault.on('rename', () => this.scheduleUpdate()));
	}

	scheduleUpdate() {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}

		this.updateTimeout = setTimeout(() => {
			void this.updateVaultSize();
		}, 1000);
	}

	async updateVaultSize() {
		this.cachedStats = await this.calculateVaultStats();
		const size = this.formatBytes(this.cachedStats.totalSize);
		const icon = this.settings.showIcon ? '📊 ' : '';
		this.statusBarItem.setText(`${icon}${size}`);
	}

	async loadSettings() {
		const loaded = await this.loadData();
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			loaded as Partial<VaultSizeSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.updateVaultSize();
	}

	async calculateVaultStats(): Promise<VaultStats> {
		const files = this.app.vault.getFiles();
		const map = new Map<string, FileTypeStats>();

		let totalSize = 0;
		let totalFiles = 0;

		for (const file of files) {
			totalSize += file.stat.size;
			totalFiles++;

			const ext = file.extension || 'no-extension';
			const existing = map.get(ext);

			if (existing) {
				existing.count++;
				existing.totalSize += file.stat.size;
			} else {
				map.set(ext, {
					extension: ext,
					count: 1,
					totalSize: file.stat.size
				});
			}
		}

		return {
			totalSize,
			totalFiles,
			fileTypes: Array.from(map.values()).sort(
				(a, b) => b.totalSize - a.totalSize
			)
		};
	}

	formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}

	onunload() {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
	}
}

class VaultSizeModal extends Modal {
	private plugin: VaultSizePlugin;

	constructor(app: App, plugin: VaultSizePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// CSS-only styling (lint-safe)
		contentEl.addClass('vault-size-modal');
		this.modalEl.addClass('vault-size-modal-container');

		contentEl.createEl('h2', { text: 'Vault statistics' });

		if (!this.plugin.cachedStats) {
			contentEl.createEl('p', { text: 'Loading statistics…' });
			return;
		}

		const stats = this.plugin.cachedStats;

		// Overall stats
		const overall = contentEl.createDiv({ cls: 'vault-stats-overall' });

		const sizeDiv = overall.createDiv({ cls: 'stat-item' });
		sizeDiv.createDiv({ text: 'Total size', cls: 'stat-label' });
		sizeDiv.createDiv({
			text: this.plugin.formatBytes(stats.totalSize),
			cls: 'stat-value'
		});

		const filesDiv = overall.createDiv({ cls: 'stat-item' });
		filesDiv.createDiv({ text: 'Total files', cls: 'stat-label' });
		filesDiv.createDiv({
			text: stats.totalFiles.toString(),
			cls: 'stat-value'
		});

		// Breakdown
		contentEl.createEl('h3', { text: 'Breakdown by file type' });

		const chartContainer = contentEl.createDiv({
			cls: 'donut-chart-container'
		});

		const donutWrapper = chartContainer.createDiv({
			cls: 'donut-wrapper'
		});

		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNS, 'svg');
		svg.setAttribute('viewBox', '0 0 200 200');
		svg.setAttribute('class', 'donut-svg');

		const cx = 100;
		const cy = 100;
		const r = 90;
		const hr = 60;

		let angle = -90;

		for (const ft of stats.fileTypes) {
			const pct = (ft.totalSize / stats.totalSize) * 100;
			const sweep = (pct / 100) * 360;

			const start = (angle * Math.PI) / 180;
			const end = ((angle + sweep) * Math.PI) / 180;

			const x1 = cx + r * Math.cos(start);
			const y1 = cy + r * Math.sin(start);
			const x2 = cx + r * Math.cos(end);
			const y2 = cy + r * Math.sin(end);

			const x3 = cx + hr * Math.cos(end);
			const y3 = cy + hr * Math.sin(end);
			const x4 = cx + hr * Math.cos(start);
			const y4 = cy + hr * Math.sin(start);

			const largeArc = sweep > 180 ? 1 : 0;

			const path = document.createElementNS(svgNS, 'path');
			path.setAttribute(
				'd',
				[
					`M ${x1} ${y1}`,
					`A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
					`L ${x3} ${y3}`,
					`A ${hr} ${hr} 0 ${largeArc} 0 ${x4} ${y4}`,
					'Z'
				].join(' ')
			);

			path.setAttribute(
				'fill',
				this.plugin.settings.extensionColors[ft.extension] ?? '#888888'
			);

			path.setAttribute('class', 'donut-segment');
			path.setAttribute('data-extension', ft.extension);

			const title = document.createElementNS(svgNS, 'title');
			title.textContent = `.${ft.extension}\n${this.plugin.formatBytes(
				ft.totalSize
			)} (${pct.toFixed(1)}%)\n${ft.count} files`;

			path.appendChild(title);
			svg.appendChild(path);

			angle += sweep;
		}

		donutWrapper.appendChild(svg);

		const center = donutWrapper.createDiv({ cls: 'donut-center-label' });
		center.createDiv({ text: 'Total', cls: 'center-label-title' });
		center.createDiv({
			text: this.plugin.formatBytes(stats.totalSize),
			cls: 'center-label-value'
		});
		center.createDiv({
			text: `${stats.totalFiles} files`,
			cls: 'center-label-files'
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
