/**
 * Simulation Builder - UI Controller
 * Handles all UI rendering and user interactions
 * @module UIController
 */

import {
    isNonEmptyString,
    toString,
    toNumber,
    debounce,
    generateId,
    sanitizeId
} from './Utils.js';

import { Stat, StatDisplayMode } from './Stat.js';
import { stateManager, TokenMode } from './StateManager.js';

/**
 * UI component identifiers
 */
const UI_IDS = Object.freeze({
    CONTAINER: 'simbuilder-container',
    SETTINGS_PANEL: 'simbuilder-settings',
    STATUS_WINDOW: 'simbuilder-status',
    STAT_LIST: 'simbuilder-stat-list',
    NOTIFICATION: 'simbuilder-notification'
});

/**
 * Main UI Controller class
 * @class
 */
export class UIController {
    constructor() {
        /** @type {HTMLElement|null} */
        this.container = null;
        
        /** @type {HTMLElement|null} */
        this.statusWindow = null;
        
        /** @type {boolean} */
        this.isStatusWindowVisible = true;
        
        /** @type {boolean} */
        this.isSettingsPanelOpen = false;

        /** @type {Function|null} */
        this._unsubscribeStatChange = null;
        
        /** @type {Function|null} */
        this._unsubscribeStateChange = null;
    }

    /**
     * Initializes the UI
     * @param {HTMLElement} parentElement - Parent element to attach UI to
     * @returns {boolean} True if initialized successfully
     */
    initialize(parentElement) {
        if (!parentElement) {
            console.error('[SimBuilder] UIController: no parent element');
            return false;
        }

        try {
            // Create main container
            this._createContainer(parentElement);
            
            // Create status window
            this._createStatusWindow();
            
            // Subscribe to state changes
            this._setupListeners();
            
            // Initial render
            this.render();
            
            console.log('[SimBuilder] UI initialized');
            return true;
        } catch (error) {
            console.error('[SimBuilder] UI initialization failed:', error);
            return false;
        }
    }

    /**
     * Creates the main container
     * @param {HTMLElement} parent - Parent element
     * @private
     */
    _createContainer(parent) {
        // Remove existing container if any
        const existing = document.getElementById(UI_IDS.CONTAINER);
        if (existing) {
            existing.remove();
        }

        this.container = document.createElement('div');
        this.container.id = UI_IDS.CONTAINER;
        this.container.className = 'simbuilder-container';
        parent.appendChild(this.container);
    }

    /**
     * Creates the status window
     * @private
     */
    _createStatusWindow() {
        this.statusWindow = document.createElement('div');
        this.statusWindow.id = UI_IDS.STATUS_WINDOW;
        this.statusWindow.className = 'simbuilder-status-window';
        
        // Header
        const header = document.createElement('div');
        header.className = 'simbuilder-status-header';
        header.innerHTML = `
            <span class="simbuilder-status-title">📊 Status</span>
            <div class="simbuilder-status-controls">
                <button class="simbuilder-btn simbuilder-btn-icon" data-action="settings" title="Settings">⚙️</button>
                <button class="simbuilder-btn simbuilder-btn-icon" data-action="toggle" title="Toggle">▼</button>
            </div>
        `;

        // Content area
        const content = document.createElement('div');
        content.className = 'simbuilder-status-content';
        content.id = UI_IDS.STAT_LIST;

        this.statusWindow.appendChild(header);
        this.statusWindow.appendChild(content);
        this.container.appendChild(this.statusWindow);

        // Add event listeners
        this._attachStatusWindowEvents();
    }

    /**
     * Attaches event listeners to status window
     * @private
     */
    _attachStatusWindowEvents() {
        this.statusWindow.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            switch (action) {
                case 'toggle':
                    this.toggleStatusWindow();
                    break;
                case 'settings':
                    this.toggleSettingsPanel();
                    break;
            }
        });
    }

    /**
     * Sets up state manager listeners
     * @private
     */
    _setupListeners() {
        // Stat change listener
        this._unsubscribeStatChange = stateManager.onStatChange((stat, result) => {
            this.updateStat(stat);
            if (stateManager.settings.showChangeNotifications) {
                this.showStatChangeNotification(stat, result);
            }
        });

        // State change listener
        this._unsubscribeStateChange = stateManager.onStateChange((eventType, data) => {
            if (eventType === 'new' || eventType === 'import' || eventType === 'reset') {
                this.render();
            }
        });
    }

    /**
     * Renders the complete UI
     */
    render() {
        this.renderStatList();
        this.updateVisibility();
    }

    /**
     * Renders the stat list
     */
    renderStatList() {
        const statList = document.getElementById(UI_IDS.STAT_LIST);
        if (!statList) return;

        const stats = stateManager.getVisibleStats();
        
        if (stats.length === 0) {
            statList.innerHTML = `
                <div class="simbuilder-empty-state">
                    <p>No stats configured</p>
                    <button class="simbuilder-btn simbuilder-btn-primary" data-action="add-stat">
                        + Add Stat
                    </button>
                </div>
            `;
            
            // Add click listener for add button
            const addBtn = statList.querySelector('[data-action="add-stat"]');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.showAddStatDialog());
            }
            return;
        }

        statList.innerHTML = '';
        
        for (const stat of stats) {
            const statElement = this._createStatElement(stat);
            statList.appendChild(statElement);
        }

        // Add "Add Stat" button at the end
        const addButton = document.createElement('button');
        addButton.className = 'simbuilder-btn simbuilder-btn-add';
        addButton.textContent = '+ Add Stat';
        addButton.addEventListener('click', () => this.showAddStatDialog());
        statList.appendChild(addButton);
    }

    /**
     * Creates a stat display element
     * @param {Stat} stat - Stat to display
     * @returns {HTMLElement} Stat element
     * @private
     */
    _createStatElement(stat) {
        const element = document.createElement('div');
        element.className = 'simbuilder-stat';
        element.dataset.statId = stat.id;

        const percentage = stat.percentage;
        const displayValue = stat.getDisplayString();

        element.innerHTML = `
            <div class="simbuilder-stat-header">
                <span class="simbuilder-stat-name">${this._escapeHtml(stat.name)}</span>
                <span class="simbuilder-stat-value">${this._escapeHtml(displayValue)}</span>
            </div>
            <div class="simbuilder-stat-bar-container">
                <div class="simbuilder-stat-bar" style="width: ${percentage}%; background-color: ${stat.color};"></div>
            </div>
            <div class="simbuilder-stat-controls">
                <button class="simbuilder-btn simbuilder-btn-small" data-action="decrease" data-stat="${stat.id}">-</button>
                <button class="simbuilder-btn simbuilder-btn-small" data-action="increase" data-stat="${stat.id}">+</button>
                <button class="simbuilder-btn simbuilder-btn-small simbuilder-btn-edit" data-action="edit" data-stat="${stat.id}">✏️</button>
            </div>
        `;

        // Add event listeners
        element.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const statId = btn.dataset.stat;
                this._handleStatAction(action, statId);
            });
        });

        return element;
    }

    /**
     * Handles stat action buttons
     * @param {string} action - Action type
     * @param {string} statId - Stat ID
     * @private
     */
    _handleStatAction(action, statId) {
        if (!stateManager.currentState) return;

        const stat = stateManager.currentState.statManager.get(statId);
        if (!stat) return;

        switch (action) {
            case 'increase':
                stat.modify(1);
                this.updateStat(stat);
                break;
            case 'decrease':
                stat.modify(-1);
                this.updateStat(stat);
                break;
            case 'edit':
                this.showEditStatDialog(stat);
                break;
        }
    }

    /**
     * Updates a single stat display
     * @param {Stat} stat - Stat to update
     */
    updateStat(stat) {
        const element = document.querySelector(`[data-stat-id="${stat.id}"]`);
        if (!element) {
            // Stat not in DOM, re-render list
            this.renderStatList();
            return;
        }

        const percentage = stat.percentage;
        const displayValue = stat.getDisplayString();

        const valueEl = element.querySelector('.simbuilder-stat-value');
        if (valueEl) {
            valueEl.textContent = displayValue;
        }

        const barEl = element.querySelector('.simbuilder-stat-bar');
        if (barEl) {
            barEl.style.width = `${percentage}%`;
            barEl.style.backgroundColor = stat.color;
        }

        // Add change animation
        element.classList.add('simbuilder-stat-changed');
        setTimeout(() => element.classList.remove('simbuilder-stat-changed'), 300);
    }

    /**
     * Shows a notification for stat change
     * @param {Stat} stat - Changed stat
     * @param {object} result - Change result
     */
    showStatChangeNotification(stat, result) {
        const change = result.actualChange || result.newValue - result.oldValue;
        if (change === 0) return;

        const sign = change > 0 ? '+' : '';
        const message = `${stat.name}: ${sign}${change}`;
        
        this.showNotification(message, change > 0 ? 'positive' : 'negative');
    }

    /**
     * Shows a notification
     * @param {string} message - Message to show
     * @param {string} [type='info'] - Notification type
     */
    showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.getElementById(UI_IDS.NOTIFICATION);
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.id = UI_IDS.NOTIFICATION;
        notification.className = `simbuilder-notification simbuilder-notification-${type}`;
        notification.textContent = message;

        this.container.appendChild(notification);

        // Auto-hide after 2 seconds
        setTimeout(() => {
            notification.classList.add('simbuilder-notification-hide');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    /**
     * Shows the add stat dialog
     */
    showAddStatDialog() {
        this._showStatDialog(null, 'Add Stat', (data) => {
            if (!stateManager.currentState) return;
            
            const stat = new Stat({
                id: sanitizeId(data.name),
                name: data.name,
                baseValue: data.maxValue,
                currentValue: data.currentValue,
                minValue: data.minValue,
                maxValue: data.maxValue,
                color: data.color,
                displayMode: data.displayMode
            });
            
            stateManager.currentState.statManager.add(stat);
            this.renderStatList();
            this.showNotification(`Added stat: ${stat.name}`, 'positive');
        });
    }

    /**
     * Shows the edit stat dialog
     * @param {Stat} stat - Stat to edit
     */
    showEditStatDialog(stat) {
        this._showStatDialog(stat, 'Edit Stat', (data) => {
            stat.name = data.name;
            stat.setBounds(data.minValue, data.maxValue);
            stat.currentValue = data.currentValue;
            stat.color = data.color;
            stat.displayMode = data.displayMode;
            
            this.updateStat(stat);
            this.showNotification(`Updated: ${stat.name}`, 'info');
        }, () => {
            // Delete handler
            if (!stateManager.currentState) return;
            stateManager.currentState.statManager.remove(stat.id);
            this.renderStatList();
            this.showNotification(`Deleted: ${stat.name}`, 'negative');
        });
    }

    /**
     * Shows a stat configuration dialog
     * @param {Stat|null} stat - Existing stat or null for new
     * @param {string} title - Dialog title
     * @param {Function} onSave - Save callback
     * @param {Function} [onDelete] - Delete callback
     * @private
     */
    _showStatDialog(stat, title, onSave, onDelete = null) {
        const isEdit = stat !== null;
        const defaults = stat || {
            name: '',
            currentValue: 100,
            minValue: 0,
            maxValue: 100,
            color: '#4a90d9',
            displayMode: StatDisplayMode.FRACTION
        };

        const dialogHtml = `
            <div class="simbuilder-dialog-overlay" id="simbuilder-dialog">
                <div class="simbuilder-dialog">
                    <div class="simbuilder-dialog-header">
                        <h3>${title}</h3>
                        <button class="simbuilder-btn simbuilder-btn-icon" data-action="close">✕</button>
                    </div>
                    <div class="simbuilder-dialog-content">
                        <div class="simbuilder-form-group">
                            <label>Name</label>
                            <input type="text" id="stat-name" value="${this._escapeHtml(defaults.name)}" placeholder="e.g., HP, MP, Stamina">
                        </div>
                        <div class="simbuilder-form-row">
                            <div class="simbuilder-form-group">
                                <label>Current</label>
                                <input type="number" id="stat-current" value="${defaults.currentValue}">
                            </div>
                            <div class="simbuilder-form-group">
                                <label>Min</label>
                                <input type="number" id="stat-min" value="${defaults.minValue}">
                            </div>
                            <div class="simbuilder-form-group">
                                <label>Max</label>
                                <input type="number" id="stat-max" value="${defaults.maxValue}">
                            </div>
                        </div>
                        <div class="simbuilder-form-row">
                            <div class="simbuilder-form-group">
                                <label>Color</label>
                                <input type="color" id="stat-color" value="${defaults.color}">
                            </div>
                            <div class="simbuilder-form-group">
                                <label>Display</label>
                                <select id="stat-display">
                                    <option value="value" ${defaults.displayMode === 'value' ? 'selected' : ''}>Value</option>
                                    <option value="fraction" ${defaults.displayMode === 'fraction' ? 'selected' : ''}>Fraction</option>
                                    <option value="percent" ${defaults.displayMode === 'percent' ? 'selected' : ''}>Percent</option>
                                    <option value="bar" ${defaults.displayMode === 'bar' ? 'selected' : ''}>Bar</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="simbuilder-dialog-footer">
                        ${isEdit && onDelete ? '<button class="simbuilder-btn simbuilder-btn-danger" data-action="delete">Delete</button>' : ''}
                        <button class="simbuilder-btn" data-action="cancel">Cancel</button>
                        <button class="simbuilder-btn simbuilder-btn-primary" data-action="save">Save</button>
                    </div>
                </div>
            </div>
        `;

        // Add dialog to DOM
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHtml;
        document.body.appendChild(dialogContainer.firstElementChild);

        const dialog = document.getElementById('simbuilder-dialog');
        
        // Event handlers
        const closeDialog = () => dialog.remove();

        dialog.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (!action) return;

            switch (action) {
                case 'close':
                case 'cancel':
                    closeDialog();
                    break;
                case 'save':
                    const name = document.getElementById('stat-name').value.trim();
                    if (!name) {
                        this.showNotification('Name is required', 'negative');
                        return;
                    }
                    onSave({
                        name,
                        currentValue: toNumber(document.getElementById('stat-current').value, 100),
                        minValue: toNumber(document.getElementById('stat-min').value, 0),
                        maxValue: toNumber(document.getElementById('stat-max').value, 100),
                        color: document.getElementById('stat-color').value,
                        displayMode: document.getElementById('stat-display').value
                    });
                    closeDialog();
                    break;
                case 'delete':
                    if (onDelete) {
                        onDelete();
                        closeDialog();
                    }
                    break;
            }
        });

        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        });
    }

    /**
     * Toggles status window visibility
     */
    toggleStatusWindow() {
        const content = this.statusWindow.querySelector('.simbuilder-status-content');
        const toggleBtn = this.statusWindow.querySelector('[data-action="toggle"]');
        
        this.isStatusWindowVisible = !this.isStatusWindowVisible;
        
        if (content) {
            content.style.display = this.isStatusWindowVisible ? 'block' : 'none';
        }
        if (toggleBtn) {
            toggleBtn.textContent = this.isStatusWindowVisible ? '▼' : '▲';
        }
    }

    /**
     * Toggles settings panel
     */
    toggleSettingsPanel() {
        this.isSettingsPanelOpen = !this.isSettingsPanelOpen;
        
        if (this.isSettingsPanelOpen) {
            this._showSettingsPanel();
        } else {
            this._hideSettingsPanel();
        }
    }

    /**
     * Shows settings panel
     * @private
     */
    _showSettingsPanel() {
        const existing = document.getElementById(UI_IDS.SETTINGS_PANEL);
        if (existing) existing.remove();

        const settings = stateManager.settings;

        const panel = document.createElement('div');
        panel.id = UI_IDS.SETTINGS_PANEL;
        panel.className = 'simbuilder-settings-panel';
        panel.innerHTML = `
            <div class="simbuilder-settings-header">
                <h4>Settings</h4>
            </div>
            <div class="simbuilder-settings-content">
                <div class="simbuilder-form-group">
                    <label>
                        <input type="checkbox" id="setting-enabled" ${settings.enabled ? 'checked' : ''}>
                        Enable Simulation
                    </label>
                </div>
                <div class="simbuilder-form-group">
                    <label>Token Mode</label>
                    <select id="setting-token-mode">
                        <option value="zero" ${settings.tokenMode === 'zero' ? 'selected' : ''}>Zero (0 tokens)</option>
                        <option value="minimal" ${settings.tokenMode === 'minimal' ? 'selected' : ''}>Minimal (~30 tokens)</option>
                        <option value="full" ${settings.tokenMode === 'full' ? 'selected' : ''}>Full (~100 tokens)</option>
                    </select>
                </div>
                <div class="simbuilder-form-group">
                    <label>
                        <input type="checkbox" id="setting-notifications" ${settings.showChangeNotifications ? 'checked' : ''}>
                        Show Change Notifications
                    </label>
                </div>
                <div class="simbuilder-settings-actions">
                    <button class="simbuilder-btn" data-action="export">Export</button>
                    <button class="simbuilder-btn" data-action="import">Import</button>
                    <button class="simbuilder-btn simbuilder-btn-danger" data-action="reset">Reset</button>
                </div>
            </div>
        `;

        this.container.appendChild(panel);

        // Event listeners
        panel.querySelector('#setting-enabled').addEventListener('change', (e) => {
            settings.enabled = e.target.checked;
            this._saveSettings();
        });

        panel.querySelector('#setting-token-mode').addEventListener('change', (e) => {
            settings.tokenMode = e.target.value;
            this._saveSettings();
        });

        panel.querySelector('#setting-notifications').addEventListener('change', (e) => {
            settings.showChangeNotifications = e.target.checked;
            this._saveSettings();
        });

        panel.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                switch (btn.dataset.action) {
                    case 'export':
                        this._exportState();
                        break;
                    case 'import':
                        this._importState();
                        break;
                    case 'reset':
                        this._resetState();
                        break;
                }
            });
        });
    }

    /**
     * Hides settings panel
     * @private
     */
    _hideSettingsPanel() {
        const panel = document.getElementById(UI_IDS.SETTINGS_PANEL);
        if (panel) panel.remove();
    }

    /**
     * Saves settings
     * @private
     */
    _saveSettings() {
        const context = SillyTavern?.getContext?.();
        if (context) {
            stateManager.saveSettings(context);
        }
    }

    /**
     * Exports state to file
     * @private
     */
    _exportState() {
        const json = stateManager.exportState();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showNotification('State exported', 'positive');
    }

    /**
     * Imports state from file
     * @private
     */
    _importState() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                if (stateManager.importState(text)) {
                    this.render();
                    this.showNotification('State imported', 'positive');
                } else {
                    this.showNotification('Import failed', 'negative');
                }
            } catch (error) {
                console.error('[SimBuilder] Import error:', error);
                this.showNotification('Import failed', 'negative');
            }
        });

        input.click();
    }

    /**
     * Resets state
     * @private
     */
    _resetState() {
        if (confirm('Are you sure you want to reset? This cannot be undone.')) {
            stateManager.reset();
            this.render();
            this.showNotification('State reset', 'info');
        }
    }

    /**
     * Updates visibility based on settings
     */
    updateVisibility() {
        if (!this.statusWindow) return;

        const shouldShow = stateManager.settings.showStatusWindow && stateManager.settings.enabled;
        this.statusWindow.style.display = shouldShow ? 'block' : 'none';
    }

    /**
     * Escapes HTML special characters
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Cleans up the UI controller
     */
    destroy() {
        if (this._unsubscribeStatChange) {
            this._unsubscribeStatChange();
        }
        if (this._unsubscribeStateChange) {
            this._unsubscribeStateChange();
        }
        if (this.container) {
            this.container.remove();
        }
    }
}

// Singleton instance
export const uiController = new UIController();

export default { UIController, uiController };
