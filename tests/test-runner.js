/**
 * Simulation Builder - Unit Tests
 * Run these in browser console to verify functionality
 * @module Tests
 */

// Test utilities
const TestRunner = {
    passed: 0,
    failed: 0,
    errors: [],

    assert(condition, message) {
        if (condition) {
            this.passed++;
            console.log(`✅ ${message}`);
        } else {
            this.failed++;
            this.errors.push(message);
            console.error(`❌ ${message}`);
        }
    },

    assertEqual(actual, expected, message) {
        const pass = actual === expected;
        if (!pass) {
            console.error(`   Expected: ${expected}, Got: ${actual}`);
        }
        this.assert(pass, message);
    },

    assertClose(actual, expected, tolerance, message) {
        const pass = Math.abs(actual - expected) <= tolerance;
        if (!pass) {
            console.error(`   Expected: ~${expected}, Got: ${actual}`);
        }
        this.assert(pass, message);
    },

    summary() {
        console.log('\n========================================');
        console.log(`Total: ${this.passed + this.failed}`);
        console.log(`Passed: ${this.passed} ✅`);
        console.log(`Failed: ${this.failed} ❌`);
        if (this.errors.length > 0) {
            console.log('\nFailed tests:');
            this.errors.forEach(e => console.log(`  - ${e}`));
        }
        console.log('========================================\n');
    },

    reset() {
        this.passed = 0;
        this.failed = 0;
        this.errors = [];
    }
};

// Import test (simulated for browser)
async function runTests() {
    console.log('🧪 Starting Simulation Builder Tests...\n');
    TestRunner.reset();

    // ========================================
    // Utils Tests
    // ========================================
    console.log('\n📦 Testing Utils Module...');

    // Test: toNumber
    (() => {
        const { toNumber } = window.SimBuilder?.Utils || {};
        if (!toNumber) {
            console.warn('Utils not loaded, skipping...');
            return;
        }

        TestRunner.assertEqual(toNumber(10), 10, 'toNumber: valid number');
        TestRunner.assertEqual(toNumber('10'), 10, 'toNumber: string number');
        TestRunner.assertEqual(toNumber(null, 5), 5, 'toNumber: null with default');
        TestRunner.assertEqual(toNumber(undefined, 5), 5, 'toNumber: undefined with default');
        TestRunner.assertEqual(toNumber(NaN, 5), 5, 'toNumber: NaN with default');
        TestRunner.assertEqual(toNumber(Infinity, 5), 5, 'toNumber: Infinity with default');
        TestRunner.assertEqual(toNumber('abc', 5), 5, 'toNumber: invalid string with default');
    })();

    // Test: clamp
    (() => {
        const { clamp } = window.SimBuilder?.Utils || {};
        if (!clamp) return;

        TestRunner.assertEqual(clamp(50, 0, 100), 50, 'clamp: value in range');
        TestRunner.assertEqual(clamp(-10, 0, 100), 0, 'clamp: below min');
        TestRunner.assertEqual(clamp(150, 0, 100), 100, 'clamp: above max');
        TestRunner.assertEqual(clamp(50, 100, 0), 50, 'clamp: swapped min/max');
    })();

    // Test: SafeMath
    (() => {
        const { SafeMath } = window.SimBuilder?.Utils || {};
        if (!SafeMath) return;

        TestRunner.assertEqual(SafeMath.add(0.1, 0.2), 0.3, 'SafeMath.add: 0.1 + 0.2 = 0.3');
        TestRunner.assertEqual(SafeMath.subtract(0.3, 0.1), 0.2, 'SafeMath.subtract: 0.3 - 0.1 = 0.2');
        TestRunner.assertEqual(SafeMath.multiply(0.1, 0.2), 0.02, 'SafeMath.multiply: 0.1 * 0.2');
        TestRunner.assertEqual(SafeMath.divide(10, 3, 0), 3.3333333333, 'SafeMath.divide: 10 / 3');
        TestRunner.assertEqual(SafeMath.divide(10, 0, -1), -1, 'SafeMath.divide: division by zero');
        TestRunner.assertEqual(SafeMath.percentage(50, 100), 50, 'SafeMath.percentage: 50%');
    })();

    // ========================================
    // StatModifier Tests
    // ========================================
    console.log('\n📦 Testing StatModifier Module...');

    (() => {
        const { StatModifier, ModifierType, ModifierCollection } = window.SimBuilder?.StatModifier || {};
        if (!StatModifier) {
            console.warn('StatModifier not loaded, skipping...');
            return;
        }

        // Test: StatModifier creation
        const mod = new StatModifier({
            id: 'test_buff',
            name: 'Test Buff',
            statId: 'hp',
            type: ModifierType.ADD,
            value: 10,
            duration: 3,
            maxStacks: 5
        });

        TestRunner.assertEqual(mod.id, 'test_buff', 'StatModifier: id set correctly');
        TestRunner.assertEqual(mod.type, 'add', 'StatModifier: type set correctly');
        TestRunner.assertEqual(mod.value, 10, 'StatModifier: value set correctly');
        TestRunner.assert(mod.isActive(), 'StatModifier: isActive true');
        TestRunner.assert(!mod.isPermanent(), 'StatModifier: isPermanent false');

        // Test: Apply modifier
        TestRunner.assertEqual(mod.apply(100), 110, 'StatModifier: ADD applies correctly');

        // Test: Stacking
        mod.addStacks(2);
        TestRunner.assertEqual(mod.currentStacks, 3, 'StatModifier: stacks added');
        TestRunner.assertEqual(mod.getEffectiveValue(), 30, 'StatModifier: effective value with stacks');

        // Test: Tick
        mod.tick();
        TestRunner.assertEqual(mod.remainingDuration, 2, 'StatModifier: tick decrements duration');
        mod.tick();
        mod.tick();
        TestRunner.assert(!mod.isActive(), 'StatModifier: expired after duration');

        // Test: ModifierCollection
        const collection = new ModifierCollection('hp');
        collection.add({ id: 'buff1', type: 'add', value: 10 });
        collection.add({ id: 'buff2', type: 'multiply', value: 1.5 });

        TestRunner.assertEqual(collection.size, 2, 'ModifierCollection: size correct');
        
        // Apply order: Add first, then Multiply
        // 100 + 10 = 110, 110 * 1.5 = 165
        TestRunner.assertEqual(collection.applyAll(100), 165, 'ModifierCollection: correct apply order');

        // Test: Override
        collection.add({ id: 'override1', type: 'override', value: 50 });
        TestRunner.assertEqual(collection.applyAll(100), 50, 'ModifierCollection: override wins');
    })();

    // ========================================
    // Stat Tests
    // ========================================
    console.log('\n📦 Testing Stat Module...');

    (() => {
        const { Stat, StatManager, StatDisplayMode } = window.SimBuilder?.Stat || {};
        if (!Stat) {
            console.warn('Stat not loaded, skipping...');
            return;
        }

        // Test: Stat creation
        const stat = new Stat({
            id: 'hp',
            name: 'Health',
            baseValue: 100,
            minValue: 0,
            maxValue: 100,
            displayMode: 'fraction'
        });

        TestRunner.assertEqual(stat.id, 'hp', 'Stat: id set correctly');
        TestRunner.assertEqual(stat.currentValue, 100, 'Stat: currentValue equals baseValue');
        TestRunner.assertEqual(stat.percentage, 100, 'Stat: percentage is 100%');
        TestRunner.assert(stat.isAtMax, 'Stat: isAtMax true');

        // Test: Modify
        const result = stat.modify(-20);
        TestRunner.assertEqual(stat.currentValue, 80, 'Stat: modify decreases value');
        TestRunner.assertEqual(result.actualChange, -20, 'Stat: actualChange correct');
        TestRunner.assertEqual(stat.lastChange, -20, 'Stat: lastChange tracked');

        // Test: Clamping
        stat.modify(-200);
        TestRunner.assertEqual(stat.currentValue, 0, 'Stat: clamped to min');
        TestRunner.assert(stat.isAtMin, 'Stat: isAtMin true');

        // Test: Set
        stat.set(50);
        TestRunner.assertEqual(stat.currentValue, 50, 'Stat: set works');

        // Test: Reset
        stat.reset();
        TestRunner.assertEqual(stat.currentValue, 100, 'Stat: reset to baseValue');

        // Test: Bounds swap
        const stat2 = new Stat({ minValue: 100, maxValue: 0 }); // Swapped
        TestRunner.assert(stat2.minValue < stat2.maxValue, 'Stat: swapped bounds corrected');

        // Test: StatManager
        const manager = new StatManager();
        manager.add({ id: 'hp', name: 'HP', baseValue: 100, maxValue: 100 });
        manager.add({ id: 'mp', name: 'MP', baseValue: 50, maxValue: 50 });

        TestRunner.assertEqual(manager.size, 2, 'StatManager: size correct');
        TestRunner.assert(manager.has('hp'), 'StatManager: has hp');
        TestRunner.assert(!manager.has('sp'), 'StatManager: does not have sp');

        manager.modify('hp', -10);
        TestRunner.assertEqual(manager.get('hp').currentValue, 90, 'StatManager: modify works');

        // Test: Display string
        TestRunner.assertEqual(stat.getDisplayString(), '100/100', 'Stat: fraction display');
    })();

    // ========================================
    // Parser Tests
    // ========================================
    console.log('\n📦 Testing Parser Module...');

    (() => {
        const { StatParser, ParseResultType, parseStatCommands } = window.SimBuilder?.Parser || {};
        if (!StatParser) {
            console.warn('Parser not loaded, skipping...');
            return;
        }

        const parser = new StatParser();

        // Test: Basic parsing
        const result1 = parser.parse('You take damage. {{hp:-10}}')[0];
        TestRunner.assert(result1.isValid, 'Parser: valid command parsed');
        TestRunner.assertEqual(result1.statId, 'hp', 'Parser: statId extracted');
        TestRunner.assertEqual(result1.value, -10, 'Parser: negative value parsed');
        TestRunner.assertEqual(result1.type, ParseResultType.MODIFY, 'Parser: type is MODIFY');

        // Test: Positive with +
        const result2 = parser.parse('{{mp:+5}}')[0];
        TestRunner.assertEqual(result2.value, 5, 'Parser: positive with + parsed');

        // Test: SET operation
        const result3 = parser.parse('{{hp:=50}}')[0];
        TestRunner.assertEqual(result3.type, ParseResultType.SET, 'Parser: SET type');
        TestRunner.assertEqual(result3.value, 50, 'Parser: SET value');

        // Test: Multiple commands
        const results = parser.parseValid('{{hp:-10}} story text {{mp:+5}} more text {{stamina:=100}}');
        TestRunner.assertEqual(results.length, 3, 'Parser: multiple commands found');

        // Test: hasCommands
        TestRunner.assert(parser.hasCommands('{{hp:-10}}'), 'Parser: hasCommands true');
        TestRunner.assert(!parser.hasCommands('no commands here'), 'Parser: hasCommands false');

        // Test: stripCommands
        const stripped = parser.stripCommands('You take {{hp:-10}} damage!');
        TestRunner.assertEqual(stripped, 'You take  damage!', 'Parser: commands stripped');

        // Test: First match rule
        const changes = parser.getStatChanges('{{hp:-10}} {{hp:-20}}');
        TestRunner.assertEqual(changes.get('hp').value, -10, 'Parser: first match wins');

        // Test: formatCommand
        const formatted = parser.formatCommand('hp', -10);
        TestRunner.assertEqual(formatted, '{{hp:-10}}', 'Parser: formatCommand works');

        // Test: Case insensitivity
        const result4 = parser.parse('{{HP:-10}}')[0];
        TestRunner.assertEqual(result4.statId, 'hp', 'Parser: case insensitive');

        // Test: Decimal values
        const result5 = parser.parse('{{hp:-10.5}}')[0];
        TestRunner.assertEqual(result5.value, -10.5, 'Parser: decimal value parsed');

        // Test: Invalid commands
        const invalid = parser.parse('{{:10}}'); // No stat ID
        TestRunner.assertEqual(invalid.length, 0, 'Parser: invalid ignored (no statId)');

        // Test: Whitespace tolerance
        const result6 = parser.parse('{{ hp : -10 }}')[0];
        TestRunner.assert(result6.isValid, 'Parser: whitespace tolerated');
    })();

    // ========================================
    // Integration Tests
    // ========================================
    console.log('\n📦 Testing Integration...');

    (() => {
        const { Stat, StatManager } = window.SimBuilder?.Stat || {};
        const { StatParser } = window.SimBuilder?.Parser || {};
        if (!Stat || !StatParser) {
            console.warn('Modules not loaded, skipping integration...');
            return;
        }

        // Test: Full flow - Parse and apply
        const manager = new StatManager();
        manager.add({ id: 'hp', name: 'HP', baseValue: 100, maxValue: 100 });
        manager.add({ id: 'mp', name: 'MP', baseValue: 50, maxValue: 50 });

        const parser = new StatParser();
        const message = 'The goblin attacks! {{hp:-15}} Your magic shield absorbs some damage. {{mp:-5}}';
        
        const commands = parser.parseValid(message);
        
        for (const cmd of commands) {
            const stat = manager.get(cmd.statId);
            if (stat) {
                stat.modify(cmd.value);
            }
        }

        TestRunner.assertEqual(manager.get('hp').currentValue, 85, 'Integration: HP decreased');
        TestRunner.assertEqual(manager.get('mp').currentValue, 45, 'Integration: MP decreased');
    })();

    // ========================================
    // Edge Cases
    // ========================================
    console.log('\n📦 Testing Edge Cases...');

    (() => {
        const { Stat } = window.SimBuilder?.Stat || {};
        const { StatParser } = window.SimBuilder?.Parser || {};
        if (!Stat) return;

        // Test: Zero max
        const stat1 = new Stat({ id: 'test', minValue: 0, maxValue: 0 });
        TestRunner.assertEqual(stat1.percentage, 100, 'Edge: zero range gives 100%');

        // Test: Negative bounds
        const stat2 = new Stat({ id: 'temp', minValue: -50, maxValue: 50 });
        stat2.set(0);
        TestRunner.assertEqual(stat2.percentage, 50, 'Edge: negative bounds work');

        // Test: Very large numbers
        const stat3 = new Stat({ id: 'big', maxValue: 999999999 });
        stat3.modify(1000000);
        TestRunner.assert(stat3.currentValue === 1000000, 'Edge: large numbers work');

        // Test: Very small decimals
        const stat4 = new Stat({ id: 'small', maxValue: 1 });
        stat4.set(0.123456789);
        TestRunner.assertClose(stat4.currentValue, 0.123456789, 0.0001, 'Edge: small decimals work');

        // Test: Parser with special characters in story
        if (StatParser) {
            const parser = new StatParser();
            const result = parser.parse('Hello "world" {{hp:-10}} <script>alert(1)</script>');
            TestRunner.assertEqual(result.length, 1, 'Edge: special chars in story ok');
            TestRunner.assertEqual(result[0].value, -10, 'Edge: value correct despite special chars');
        }
    })();

    // Summary
    TestRunner.summary();
}

// Export for console testing
if (typeof window !== 'undefined') {
    window.SimBuilderTests = {
        run: runTests,
        runner: TestRunner
    };
}

// Auto-run if loaded
console.log('📋 SimBuilder Tests loaded. Run with: SimBuilderTests.run()');
