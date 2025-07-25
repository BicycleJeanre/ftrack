/**
 * Generic Calculation Engine for formula-based field updates
 */
export class CalculationEngine {
    constructor(schema) {
        this.schema = schema;
    }

    getConstant(name, key) {
        // Support lookup tables (e.g., constants.periods.Monthly)
        if (this.schema.constants && this.schema.constants[name]) {
            if (key) return this.schema.constants[name][key] || this.schema.constants[name].default;
            return this.schema.constants[name];
        }
        return undefined;
    }

    applyFieldDefaults(data, optionField, value) {
        console.log('[CalculationEngine] applyFieldDefaults:', { optionField, value, defaults: this.schema.fieldDefaults?.[value], before: { ...data } });
        const defaults = this.schema.fieldDefaults?.[value];
        if (defaults) {
            Object.keys(defaults).forEach(field => {
                data[field] = defaults[field];
            });
            console.log('[CalculationEngine] after fieldDefaults:', { ...data });
        }
    }

    evaluateFormula(formula, data) {
        console.log('[CalculationEngine] evaluateFormula:', { formula, data: { ...data } });
        // Provide context for formula evaluation
        const context = { ...data };
        // Add all constants to context
        if (this.schema.constants) {
            Object.entries(this.schema.constants).forEach(([name, val]) => {
                context[name] = val;
            });
        }
        // Only allow Math and context
        try {
            // Extract target field
            const match = formula.match(/^(\w+)\s*=/);
            if (!match) return;
            const targetField = match[1];
            // Build function
            const fn = new Function(...Object.keys(context), 'Math', `return ${formula.split('=')[1]};`);
            const result = fn(...Object.values(context), Math);
            if (!isNaN(result)) {
                data[targetField] = Math.round(result * 10000) / 10000;
                console.log(`[CalculationEngine] set ${targetField} to`, data[targetField]);
            }
        } catch (e) {
            console.warn('Formula evaluation error:', formula, e);
        }
    }

    handleFieldChange(field, value, data) {
        console.log('[CalculationEngine] handleFieldChange:', { field, value, before: { ...data } });
        // Handle option field changes (like presetOption)
        if (this.schema.fieldDefaults && this.schema.fieldDefaults[value]) {
            this.applyFieldDefaults(data, field, value);
        }
        // Handle formulas
        const formulas = this.schema.formulas?.[field];
        if (formulas && formulas.onChange) {
            if (typeof formulas.onChange === 'string') {
                this.evaluateFormula(formulas.onChange, data);
            } else {
                // Multiple field updates
                Object.entries(formulas.onChange).forEach(([target, expr]) => {
                    // Support fieldDefaults lookup
                    if (expr.startsWith('fieldDefaults')) {
                        const option = data[field];
                        const key = expr.match(/\.([^.]+)$/)?.[1];
                        data[target] = this.schema.fieldDefaults?.[option]?.[key];
                        console.log(`[CalculationEngine] set ${target} to`, data[target], 'using', expr);
                    }
                });
            }
        }
        console.log('[CalculationEngine] after handleFieldChange:', { ...data });
    }
}
