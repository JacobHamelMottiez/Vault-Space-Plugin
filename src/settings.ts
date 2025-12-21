import { App, PluginSettingTab, Setting } from "obsidian";
import VaultSizePlugin from "./main";

export interface VaultSizeSettings {
    showIcon: boolean;
    statusBarFormat: string;
}

export const DEFAULT_SETTINGS: VaultSizeSettings = {
    showIcon: true,
    statusBarFormat: '📊 {size}'
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
    }
}