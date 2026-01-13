     */
    initialize(context) {
        if (!context) {
            console.error('[SimBuilder] StateManager.initialize: no context provided');
            return false;
        }

        try {
            // Load settings from extension settings
            this._loadSettings(context);
            
            // Load presets
            this._loadPresets(context);
            
            // Load global state
            this._loadGlobalState(context);
            
            // Load or create state for current chat
            this._loadStateForChat(context);
            
            this._initialized = true;
            console.log('[SimBuilder] StateManager initialized');
            return true;
        } catch (error) {
            console.error('[SimBuilder] StateManager initialization failed:', error);
            return false;
        }
    }

    /**
     * Loads settings from SillyTavern extension settings
     * @param {object} context - SillyTavern context
     * @private
     */
    _loadSettings(context) {
        const { extensionSettings } = context;
        const MODULE_NAME = 'simulation_builder';

        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = deepClone(DEFAULT_SETTINGS);
        }

        // Merge with defaults to handle new settings
        const saved = extensionSettings[MODULE_NAME];
        this.settings = {
            ...deepClone(DEFAULT_SETTINGS),
            ...saved
        };

        // Update parser config
        if (this.settings.parserConfig) {
            this.parser.setConfig(this.settings.parserConfig);
        }
    }

    /**
     * Loads presets from extension settings
     * @param {object} context - SillyTavern context
     * @private
     */
    _loadPresets(context) {
        const { extensionSettings } = context;
        const PRESETS_KEY = 'simulation_builder_presets';

        if (extensionSettings[PRESETS_KEY]) {
            this.presetManager.fromJSON(extensionSettings[PRESETS_KEY]);
            console.log(`[SimBuilder] Loaded ${this.presetManager.count} presets`);
        }
    }

    /**
     * Saves presets to extension settings
     * @param {object} context - SillyTavern context
     */
    savePresets(context) {
        if (!context) return;

        const { extensionSettings, saveSettingsDebounced } = context;
        const PRESETS_KEY = 'simulation_builder_presets';

        extensionSettings[PRESETS_KEY] = this.presetManager.toJSON();

        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        }
    }

    /**
     * Loads global state from extension settings
     * @param {object} context - SillyTavern context
     * @private
     */
    _loadGlobalState(context) {
        const { extensionSettings } = context;
        const GLOBAL_STATE_KEY = 'simulation_builder_global';

        if (extensionSettings[GLOBAL_STATE_KEY]) {
            try {
                this.globalState = SimulationState.fromJSON(extensionSettings[GLOBAL_STATE_KEY]);
                console.log('[SimBuilder] Loaded global state');
            } catch (error) {
                console.error('[SimBuilder] Failed to load global state:', error);
                this.globalState = new SimulationState('global');
            }
        } else {
            this.globalState = new SimulationState('global');
            this.globalState.name = 'Global State';
        }
    }

    /**
     * Saves global state to extension settings
     * @param {object} context - SillyTavern context
     */
    saveGlobalState(context) {
        if (!context || !this.globalState) return;

        const { extensionSettings, saveSettingsDebounced } = context;
        const GLOBAL_STATE_KEY = 'simulation_builder_global';

        this.globalState.updatedAt = Date.now();
        extensionSettings[GLOBAL_STATE_KEY] = this.globalState.toJSON();

        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        }
    }

    /**
     * Saves settings to SillyTavern
     * @param {object} context - SillyTavern context
     */
    saveSettings(context) {
        if (!context) {
            console.warn('[SimBuilder] saveSettings: no context');
            return;
        }

        const { extensionSettings, saveSettingsDebounced } = context;
        const MODULE_NAME = 'simulation_builder';

        extensionSettings[MODULE_NAME] = deepClone(this.settings);
        
        if (typeof saveSettingsDebounced === 'function') {
            saveSettingsDebounced();
        }
    }

    /**
     * Loads or creates state for the current chat
     * @param {object} context - SillyTavern context
     * @private
     */
    _loadStateForChat(context) {
        const { chatMetadata } = context;
        const MODULE_NAME = 'simulation_builder';

        if (chatMetadata && chatMetadata[MODULE_NAME]) {
            // Load existing state
            try {
                this.currentState = SimulationState.fromJSON(chatMetadata[MODULE_NAME]);
                console.log('[SimBuilder] Loaded existing state:', this.currentState.id);
            } catch (error) {
                console.error('[SimBuilder] Failed to load state:', error);
                this.currentState = new SimulationState();
            }
        } else {
            // Create new state
            this.currentState = new SimulationState();
            console.log('[SimBuilder] Created new state:', this.currentState.id);
        }
    }

    /**
     * Saves current state to chat metadata
     * @param {object} context - SillyTavern context
     * @returns {Promise<boolean>} True if saved successfully
     */
    async saveState(context) {
        if (!context || !this.currentState) {
            console.warn('[SimBuilder] saveState: missing context or state');
            return false;
        }

        try {
            const { chatMetadata, saveMetadata } = context;
            const MODULE_NAME = 'simulation_builder';

            this.currentState.updatedAt = Date.now();
            chatMetadata[MODULE_NAME] = this.currentState.toJSON();

            if (typeof saveMetadata === 'function') {
                await saveMetadata();
            }

            console.log('[SimBuilder] State saved');
            return true;
        } catch (error) {
            console.error('[SimBuilder] Failed to save state:', error);
            return false;
        }
    }

    /**
     * Processes AI message and applies stat changes
     * @param {string} message - AI message text
     * @returns {object} Processing result
     */
    processMessage(message) {
        const activeState = this.getActiveState();
        if (!activeState) {
            return { success: false, error: 'No active state', changes: [] };
        }

        if (!this.settings.enabled) {
            return { success: true, changes: [], disabled: true };
        }

        const commands = this.parser.parseValid(message);
        const changes = [];

        for (const cmd of commands) {
            const stat = activeState.statManager.get(cmd.statId);
            
            if (!stat) {
                console.warn(`[SimBuilder] Stat not found: ${cmd.statId}`);
                changes.push({
                    statId: cmd.statId,
                    success: false,
                    error: 'Stat not found'
                });
                continue;
            }

            let result;
            if (cmd.type === ParseResultType.SET) {
                result = stat.set(cmd.value);
            } else {
                result = stat.modify(cmd.value);
            }

            changes.push({
                statId: cmd.statId,
                statName: stat.name,
                success: true,
                ...result,
                commandType: cmd.type
            });

            // Notify listeners
            this._notifyStatChange(stat, result);
        }

        return {
            success: true,
            changes,
            commandCount: commands.length
        };
    }

    /**
     * Gets the stat info string for AI context based on token mode
     * @returns {string} Stat info string
     */
    getAIContext() {
        const activeState = this.getActiveState();
        if (!activeState || !this.settings.enabled) {
            return '';
        }

        const stats = activeState.statManager.getVisible();
        
        if (stats.length === 0) {
            return '';
        }

        switch (this.settings.tokenMode) {
            case TokenMode.ZERO:
                return '';

            case TokenMode.MINIMAL:
                // Single line: [HP:80 MP:50 STR:10]
                const parts = stats.map(s => `${s.name}:${Math.round(s.finalValue)}`);
                return `[${parts.join(' ')}]`;

            case TokenMode.FULL:
                // Multi-line detailed
                const lines = stats.map(s => {
                    const change = s.lastChange !== 0 
                        ? ` (${s.lastChange > 0 ? '+' : ''}${s.lastChange})` 
                        : '';
                    return `${s.name}: ${s.getDisplayString()}${change}`;
                });
                return `[Status]\n${lines.join('\n')}`;

            default:
                return '';
        }
    }

    /**
     * Advances simulation by one turn
     * @returns {object} Tick results
     */
    tick() {
        const activeState = this.getActiveState();
        if (!activeState) {
            return { success: false, error: 'No active state' };
        }

        const result = activeState.tick();
        this._notifyStateChange('tick', result);
        return { success: true, ...result };
    }

    /**
     * Resets the current simulation
     */
    reset() {
        const activeState = this.getActiveState();
        if (!activeState) {
            return;
        }

        activeState.reset();
        this._notifyStateChange('reset', {});
    }

    /**
     * Applies a preset to the active state
     * @param {string} presetId - Preset ID to apply
     * @returns {boolean} True if applied successfully
     */
    applyPreset(presetId) {
        const preset = this.presetManager.get(presetId);
        if (!preset) {
            console.warn('[SimBuilder] Preset not found:', presetId);
            return false;
        }

        const activeState = this.getActiveState();
        if (!activeState) {
            return false;
        }

        // Clear existing stats
        activeState.statManager.clear();

        // Apply preset stats using StatManager's loadFromJSON
        if (preset.stats && Array.isArray(preset.stats)) {
            activeState.statManager.fromJSON({ stats: preset.stats });
        }

        this.settings.activePresetId = presetId;
        this._notifyStateChange('preset_applied', { presetId, preset });
        
        console.log(`[SimBuilder] Applied preset: ${preset.name}`);
        return true;
    }

    /**
     * Saves current state as a preset
     * @param {string} name - Preset name
     * @param {string} [description] - Preset description
     * @returns {StatPreset|null} Created preset or null
     */
    saveAsPreset(name, description = '') {
        const activeState = this.getActiveState();
        if (!activeState) {
            return null;
        }

        const preset = this.presetManager.createFromState(activeState, name);
        preset.description = description;
        this.presetManager.add(preset);
        
        console.log(`[SimBuilder] Saved preset: ${name}`);
        return preset;
    }

    /**
     * Creates a new simulation state
     * @param {string} [name] - Simulation name
     * @returns {SimulationState} New state
     */
    createNewState(name) {
        this.currentState = new SimulationState();
        if (isNonEmptyString(name)) {
            this.currentState.name = name;
        }
        this._notifyStateChange('new', {});
        return this.currentState;
    }

    /**
     * Exports current state to JSON string
     * @returns {string} JSON string
     */
    exportState() {
        if (!this.currentState) {
            return '{}';
        }
        return JSON.stringify(this.currentState.toJSON(), null, 2);
    }

    /**
     * Imports state from JSON string
     * @param {string} jsonString - JSON state string
     * @returns {boolean} True if imported successfully
     */
    importState(jsonString) {
        const data = safeJsonParse(jsonString, null);
        if (!data) {
            console.error('[SimBuilder] Import failed: invalid JSON');
            return false;
        }

        try {
            this.currentState = SimulationState.fromJSON(data);
            this._notifyStateChange('import', {});
            return true;
        } catch (error) {
            console.error('[SimBuilder] Import failed:', error);
            return false;
        }
    }

    /**
     * Registers a state change listener
     * @param {Function} listener - Callback(eventType, data)
     * @returns {Function} Unsubscribe function
     */
    onStateChange(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        this._stateChangeListeners.push(listener);
        return () => {
            const idx = this._stateChangeListeners.indexOf(listener);
            if (idx > -1) this._stateChangeListeners.splice(idx, 1);
        };
    }

    /**
     * Registers a stat change listener
     * @param {Function} listener - Callback(stat, changeResult)
     * @returns {Function} Unsubscribe function
     */
    onStatChange(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }
        this._statChangeListeners.push(listener);
        return () => {
            const idx = this._statChangeListeners.indexOf(listener);
            if (idx > -1) this._statChangeListeners.splice(idx, 1);
        };
    }

    /**
     * Notifies state change listeners
     * @param {string} eventType - Event type
     * @param {object} data - Event data
     * @private
     */
    _notifyStateChange(eventType, data) {
        for (const listener of this._stateChangeListeners) {
            try {
                listener(eventType, data);
            } catch (e) {
                console.error('[SimBuilder] State change listener error:', e);
            }
        }
    }

    /**
     * Notifies stat change listeners
     * @param {object} stat - Changed stat
     * @param {object} result - Change result
     * @private
     */
    _notifyStatChange(stat, result) {
        for (const listener of this._statChangeListeners) {
            try {
                listener(stat, result);
            } catch (e) {
                console.error('[SimBuilder] Stat change listener error:', e);
            }
        }
    }

    /**
     * Checks if manager is initialized
     * @returns {boolean} True if initialized
     */
    get isInitialized() {
        return this._initialized;
    }

    /**
     * Gets current stats for UI
     * @returns {Array} Stats array
     */
    getStats() {
        const activeState = this.getActiveState();
        if (!activeState) {
            return [];
        }
        return activeState.statManager.getAll();
    }

    /**
     * Gets visible stats for UI
     * @returns {Array} Visible stats array
     */
    getVisibleStats() {
        const activeState = this.getActiveState();
        if (!activeState) {
            return [];
        }
        return activeState.statManager.getVisible();
    }

    /**
     * Sets the state scope mode
     * @param {string} scope - 'global' or 'per_chat'
     */
    setStateScope(scope) {
        if (scope === StateScope.GLOBAL || scope === StateScope.PER_CHAT) {
            this.settings.stateScope = scope;
            this._notifyStateChange('scope_changed', { scope });
        }
    }

    /**
     * Gets the current state scope
     * @returns {string} Current scope
     */
    getStateScope() {
        return this.settings.stateScope;
    }
}

// Singleton instance
export const stateManager = new StateManager();

export default { StateManager, SimulationState, StatPreset, PresetManager, TokenMode, StateScope, DEFAULT_SETTINGS, stateManager };
