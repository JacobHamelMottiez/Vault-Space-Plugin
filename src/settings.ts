import { App, PluginSettingTab, Setting } from "obsidian";
import VaultSizePlugin from "./main";

export interface VaultSizeSettings {
    showIcon: boolean;
    statusBarFormat: string;
    extensionColors: Record<string, string>;
}

export const DEFAULT_SETTINGS: VaultSizeSettings = {
    showIcon: true,
    statusBarFormat: '📊 {size}',
    extensionColors: {
        'md': '#00b894',
        'pdf': '#d63031',
        'png': '#fdcb6e',
        'jpg': '#fdcb6e',
        'jpeg': '#fdcb6e',
        'mp4': '#6c5ce7',
        'mp3': '#a29bfe',
        'txt': '#74b9ff',
        'docx': '#0984e3',
        'xlsx': '#00cec9'
    }
}

export class VaultSizeSettingTab extends PluginSettingTab {
    plugin: VaultSizePlugin;

    constructor(app: App, plugin: VaultSizePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // Display section
        new Setting(containerEl)
            .setName('Display')
            .setHeading();

        new Setting(containerEl)
            .setName('Show icon in status bar')
            .setDesc('Display the 📊 icon before the vault size')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showIcon)
                .onChange(async (value) => {
                    this.plugin.settings.showIcon = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Status bar format')
            .setDesc('Customize how the vault size appears in the status bar. Use {size} as a placeholder.')
            .addText(text => text
                .setPlaceholder('📊 {size}')
                .setValue(this.plugin.settings.statusBarFormat)
                .onChange(async (value) => {
                    this.plugin.settings.statusBarFormat = value;
                    await this.plugin.saveSettings();
                }));

        // Extension colors section
        new Setting(containerEl)
            .setName('Extension colors')
            .setHeading();

        new Setting(containerEl)
            .setName('Customize file type colors')
            .setDesc('Set custom colors for the progress bars of each file extension in your vault');

        // Get all unique extensions from the vault
        const extensions = new Set<string>();
        this.app.vault.getFiles().forEach(file => {
            const ext = file.extension || 'no extension';
            extensions.add(ext);
        });

        // Sort extensions alphabetically
        const sortedExtensions = Array.from(extensions).sort();

        // Create a color picker for each extension
        sortedExtensions.forEach(ext => {
            const currentColor = this.plugin.settings.extensionColors[ext] || '#888888';
            
            new Setting(containerEl)
                .setName(`.${ext}`)
                .setDesc(`Color for ${ext} files`)
                .addColorPicker(color => color
                    .setValue(currentColor)
                    .onChange(async (value) => {
                        this.plugin.settings.extensionColors[ext] = value;
                        await this.plugin.saveSettings();
                    }))
                .addExtraButton(button => button
                    .setIcon('reset')
                    .setTooltip('Reset to default')
                    .onClick(async () => {
                        // Remove custom color to use default
                        delete this.plugin.settings.extensionColors[ext];
                        await this.plugin.saveSettings();
                        this.display(); // Refresh settings
                    }));
        });

        // Info message
        if (sortedExtensions.length === 0) {
            new Setting(containerEl)
                .setDesc('No files found in vault. Add some files to customize extension colors.');
        }
    }
}