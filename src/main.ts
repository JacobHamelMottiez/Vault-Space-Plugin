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
        this.updateVaultSize();

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
            this.updateVaultSize();
        }, 1000);
    }

    updateVaultSize() {
        this.cachedStats = this.calculateVaultStats();
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
        this.updateVaultSize();
    }

    calculateVaultStats(): VaultStats {
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
        
        // Set a maximum width on the modal itself to prevent horizontal scrolling
        this.modalEl.style.maxWidth = '95vw';
        this.modalEl.style.width = '800px';
        this.modalEl.style.maxHeight = '90vh';
        this.modalEl.style.overflow = 'auto';

        // Title
        contentEl.createEl('h1', { text: 'Vault statistics' });

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

        // Interactive donut chart (like Highcharts pie chart)
        const chartContainer = contentEl.createDiv({ cls: 'donut-chart-container' });
        
        // Create the donut chart wrapper with SVG for interactive segments
        const donutWrapper = chartContainer.createDiv({ cls: 'donut-wrapper' });
        
        // Create SVG for interactive pie chart
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 200 200");
        svg.setAttribute("class", "donut-svg");
        
        const centerX = 100;
        const centerY = 100;
        const radius = 90;
        const holeRadius = 60;
        
        let currentAngle = -90; // Start at top
        
        // Create each segment as a path
        for (const fileType of stats.fileTypes) {
            const color = this.plugin.settings.extensionColors[fileType.extension] || '#888888';
            const percentage = (fileType.totalSize / stats.totalSize) * 100;
            const angle = (percentage / 100) * 360;
            
            // Create path for donut segment
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            const startRadians = (startAngle * Math.PI) / 180;
            const endRadians = (endAngle * Math.PI) / 180;
            
            const x1 = centerX + radius * Math.cos(startRadians);
            const y1 = centerY + radius * Math.sin(startRadians);
            const x2 = centerX + radius * Math.cos(endRadians);
            const y2 = centerY + radius * Math.sin(endRadians);
            
            const x3 = centerX + holeRadius * Math.cos(endRadians);
            const y3 = centerY + holeRadius * Math.sin(endRadians);
            const x4 = centerX + holeRadius * Math.cos(startRadians);
            const y4 = centerY + holeRadius * Math.sin(startRadians);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            const pathData = [
                `M ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                `L ${x3} ${y3}`,
                `A ${holeRadius} ${holeRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
                'Z'
            ].join(' ');
            
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d", pathData);
            path.setAttribute("fill", color);
            path.setAttribute("class", "donut-segment");
            path.setAttribute("data-extension", fileType.extension);
            
            // Add hover tooltip
            const title = document.createElementNS(svgNS, "title");
            title.textContent = `.${fileType.extension}\n${this.plugin.formatBytes(fileType.totalSize)} (${percentage.toFixed(1)}%)\n${fileType.count} files`;
            path.appendChild(title);
            
            // Hover effects
            path.addEventListener('mouseenter', () => {
                path.setAttribute("class", "donut-segment donut-segment-hover");
                // Highlight corresponding legend item
                const legendItems = contentEl.querySelectorAll('.donut-legend-item');
                legendItems.forEach((item: HTMLElement) => {
                    const itemExt = item.querySelector('.legend-ext-name')?.textContent;
                    if (itemExt === `.${fileType.extension}`) {
                        item.addClass('legend-item-active');
                    }
                });
            });
            
            path.addEventListener('mouseleave', () => {
                path.setAttribute("class", "donut-segment");
                // Remove highlight from legend
                const legendItems = contentEl.querySelectorAll('.donut-legend-item');
                legendItems.forEach((item: HTMLElement) => {
                    item.removeClass('legend-item-active');
                });
            });
            
            svg.appendChild(path);
            currentAngle = endAngle;
        }
        
        donutWrapper.appendChild(svg);
        
        // Center label showing total
        const centerLabel = donutWrapper.createDiv({ cls: 'donut-center-label' });
        centerLabel.createEl('div', { 
            text: 'Total',
            cls: 'center-label-title'
        });
        centerLabel.createEl('div', { 
            text: this.plugin.formatBytes(stats.totalSize),
            cls: 'center-label-value'
        });
        centerLabel.createEl('div', { 
            text: `${stats.totalFiles} files`,
            cls: 'center-label-files'
        });

        // Interactive legend with percentages
        const legend = chartContainer.createDiv({ cls: 'donut-legend' });
        
        for (const fileType of stats.fileTypes) {
            const color = this.plugin.settings.extensionColors[fileType.extension] || '#888888';
            const percentage = (fileType.totalSize / stats.totalSize) * 100;
            
            const legendItem = legend.createDiv({ cls: 'donut-legend-item' });
            
            // Color indicator
            const colorBox = legendItem.createDiv({ cls: 'legend-color-box' });
            colorBox.setCssProps({ backgroundColor: color });
            
            // Text info
            const legendInfo = legendItem.createDiv({ cls: 'legend-info' });
            
            const legendName = legendInfo.createDiv({ cls: 'legend-name' });
            const extNameSpan = legendName.createEl('span', { 
                text: `.${fileType.extension}`,
                cls: 'legend-ext-name'
            });
            extNameSpan.setCssProps({ color: color });
            legendName.createEl('span', { 
                text: `${percentage.toFixed(1)}%`,
                cls: 'legend-percentage'
            });
            
            const legendDetails = legendInfo.createDiv({ cls: 'legend-details' });
            const sizeSpan = legendDetails.createEl('span', { 
                text: this.plugin.formatBytes(fileType.totalSize),
                cls: 'legend-size'
            });
            sizeSpan.setCssProps({ color: color });
            legendDetails.createEl('span', { 
                text: ` • ${fileType.count} files`,
                cls: 'legend-count'
            });
            
            // Make it interactive - highlight corresponding segment
            legendItem.addEventListener('mouseenter', () => {
                legendItem.addClass('legend-item-active');
                // Highlight corresponding donut segment
                const segments = svg.querySelectorAll('.donut-segment');
                segments.forEach((segment: SVGPathElement) => {
                    if (segment.getAttribute('data-extension') === fileType.extension) {
                        segment.setAttribute('class', 'donut-segment donut-segment-hover');
                    } else {
                        segment.setAttribute('class', 'donut-segment donut-segment-dimmed');
                    }
                });
            });
            
            legendItem.addEventListener('mouseleave', () => {
                legendItem.removeClass('legend-item-active');
                // Remove highlight from all segments
                const segments = svg.querySelectorAll('.donut-segment');
                segments.forEach((segment: SVGPathElement) => {
                    segment.setAttribute('class', 'donut-segment');
                });
            });
        }

    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
