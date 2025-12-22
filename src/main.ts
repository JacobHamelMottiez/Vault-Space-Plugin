import { Plugin, Modal, App } from 'obsidian';
import { VaultSizeSettingTab, VaultSizeSettings, DEFAULT_SETTINGS } from './settings';

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
    public settings: VaultSizeSettings;
    private statusBarItem: HTMLElement;
    private updateTimeout: ReturnType<typeof setTimeout> | null = null;
    public cachedStats: VaultStats | null = null;

    async onload() {
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new VaultSizeSettingTab(this.app, this));

        // Add ribbon icon
        this.addRibbonIcon('database', 'View vault size', () => {
            new VaultSizeModal(this.app, this).open();
        });

        // Create status bar item
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.setText('Calculating...');
        this.statusBarItem.addClass('mod-clickable');
        this.statusBarItem.addEventListener('click', () => {
            new VaultSizeModal(this.app, this).open();
        });

        // Initial calculation
        await this.updateVaultSize();

        // Update when files change
        this.registerEvent(
            this.app.vault.on('create', () => this.scheduleUpdate())
        );
        this.registerEvent(
            this.app.vault.on('delete', () => this.scheduleUpdate())
        );
        this.registerEvent(
            this.app.vault.on('modify', () => this.scheduleUpdate())
        );
        this.registerEvent(
            this.app.vault.on('rename', () => this.scheduleUpdate())
        );
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
        const formattedSize = this.formatBytes(this.cachedStats.totalSize);
        const icon = this.settings.showIcon ? '📊 ' : '';
        this.statusBarItem.setText(`${icon}${formattedSize}`);
    }

    async loadSettings() {
        const loadedData: unknown = await this.loadData();
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            loadedData as Partial<VaultSizeSettings>
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update status bar when settings change
        await this.updateVaultSize();
    }

    async calculateVaultStats(): Promise<VaultStats> {
        const files = this.app.vault.getFiles();
        const fileTypeMap = new Map<string, FileTypeStats>();
        let totalSize = 0;
        let totalFiles = 0;

        for (const file of files) {
            totalSize += file.stat.size;
            totalFiles++;

            const ext = file.extension || 'no extension';
            const existing = fileTypeMap.get(ext);

            if (existing) {
                existing.count++;
                existing.totalSize += file.stat.size;
            } else {
                fileTypeMap.set(ext, {
                    extension: ext,
                    count: 1,
                    totalSize: file.stat.size
                });
            }
        }

        const fileTypes = Array.from(fileTypeMap.values())
            .sort((a, b) => b.totalSize - a.totalSize);

        return {
            totalSize,
            totalFiles,
            fileTypes
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
    plugin: VaultSizePlugin;

    constructor(app: App, plugin: VaultSizePlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-size-modal');

        // Title
        contentEl.createEl('h2', { text: 'Vault statistics' });

        if (!this.plugin.cachedStats) {
            contentEl.createEl('p', { text: 'Loading statistics...' });
            return;
        }

        const stats = this.plugin.cachedStats;

        // Overall stats
        const overallDiv = contentEl.createDiv({ cls: 'vault-stats-overall' });
        
        const totalSizeDiv = overallDiv.createDiv({ cls: 'stat-item' });
        totalSizeDiv.createEl('div', { text: 'Total size', cls: 'stat-label' });
        totalSizeDiv.createEl('div', { 
            text: this.plugin.formatBytes(stats.totalSize), 
            cls: 'stat-value' 
        });

        const totalFilesDiv = overallDiv.createDiv({ cls: 'stat-item' });
        totalFilesDiv.createEl('div', { text: 'Total files', cls: 'stat-label' });
        totalFilesDiv.createEl('div', { 
            text: stats.totalFiles.toString(), 
            cls: 'stat-value' 
        });

        // File type breakdown
        contentEl.createEl('h3', { text: 'Breakdown by file type' });

        const tableDiv = contentEl.createDiv({ cls: 'vault-stats-table' });
        
        for (const fileType of stats.fileTypes) {
            const row = tableDiv.createDiv({ cls: 'file-type-row' });
            
            // Get color for this extension
            const color = this.plugin.settings.extensionColors[fileType.extension] || '#888888';
            
            const extDiv = row.createDiv({ cls: 'file-ext' });
            const extSpan = extDiv.createEl('span', { text: `.${fileType.extension}` });
            extSpan.setCssProps({ color: color });
            
            const countDiv = row.createDiv({ cls: 'file-count' });
            countDiv.createEl('span', { text: `${fileType.count} files` });
            
            const sizeDiv = row.createDiv({ cls: 'file-size' });
            sizeDiv.createEl('span', { 
                text: this.plugin.formatBytes(fileType.totalSize) 
            });

            // Progress bar with custom color
            const percentage = (fileType.totalSize / stats.totalSize) * 100;
            const barDiv = row.createDiv({ cls: 'file-bar' });
            const fillDiv = barDiv.createDiv({ cls: 'file-bar-fill' });
            fillDiv.setCssProps({ 
                width: `${percentage}%`,
                backgroundColor: color
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}