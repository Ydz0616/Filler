// src/browser/distiller.ts

export interface DebugItem {
    id: string;
    type: string;
    question: string;
    content: string;
    optionStatus: string;
}

export interface DistillResult {
    html: string;
    summary: DebugItem[];
}

// Updated signature to accept simplifyFilled mode
export function distillPage(simplifyFilled: boolean = false): DistillResult {
    let idCounter = 0;
    const ALLOWED_ATTRS = ['type', 'name', 'placeholder', 'aria-label', 'aria-labelledby', 'role', 'value', 'for', 'checked', 'disabled', 'required', 'aria-expanded', 'aria-haspopup'];

    // --- Helpers ---
    function isVisible(el: Element): boolean {
        const htmlEl = el as HTMLElement;
        if (htmlEl.style && (htmlEl.style.display === 'none' || htmlEl.style.visibility === 'hidden')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isInteractive(el: Element): boolean {
        const tag = el.tagName;
        const role = el.getAttribute('role');
        const inputType = el.getAttribute('type');
        if (tag === 'INPUT' && inputType === 'hidden') return false;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return true;
        if (['listbox', 'combobox', 'checkbox', 'radio', 'textbox', 'searchbox'].includes(role || '')) return true;
        return false;
    }

    // 🔥 Context Hunter
    function findContextLabel(el: Element): string {
        let label = "";
        if (el.tagName === 'LABEL') return el.textContent?.trim() || "";
        
        const id = el.id;
        if (id) {
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) label = labelEl.textContent?.trim() || "";
        }
        if (!label) label = el.getAttribute('aria-label') || "";
        
        const weakLabels = ['attach', 'select...', 'select', 'toggle flyout', ''];
        if (weakLabels.includes(label.toLowerCase())) {
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) return legend.textContent?.trim() + " > " + label;
            }

            const group = el.closest('[role="group"]');
            if (group) {
                const groupLabel = group.getAttribute('aria-label') || group.firstElementChild?.textContent?.trim();
                if (groupLabel) return groupLabel + " > " + label;
            }
        }

        if (el.tagName === 'BUTTON' && !label) {
            return el.textContent?.trim() || "";
        }

        return label;
    }

    // 🔥 NEW: Check if a field is already filled (for Spotlight mode)
    function isFieldFilled(el: Element): boolean {
        const tag = el.tagName;
        
        if (tag === 'INPUT') {
            const input = el as HTMLInputElement;
            const type = input.type;
            if (['checkbox', 'radio'].includes(type)) return input.checked;
            if (type === 'file') return input.files !== null && input.files.length > 0;
            // For text inputs, check if value is substantial
            return input.value.trim().length > 0;
        }
        if (tag === 'TEXTAREA') {
            return (el as HTMLTextAreaElement).value.trim().length > 0;
        }
        if (tag === 'SELECT') {
            const select = el as HTMLSelectElement;
            // Check if value is not empty or default
            return select.value.trim().length > 0 && select.selectedIndex !== -1;
        }
        // For custom ARIA checkboxes/combos
        if (el.getAttribute('aria-checked') === 'true') return true;
        
        return false;
    }

    // --- Main Recursion ---
    function processNode(node: Node): Node | null {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim() || '';
            if (text.length > 0) {
                if (text.length > 150) return document.createTextNode(text.substring(0, 50) + '...[omitted]');
                return document.createTextNode(text);
            }
            return null;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'IFRAME', 'LINK', 'META'].includes(el.tagName)) return null;
            if (!isVisible(el)) return null;

            let smeId: string | null = null;
            let isFilled = false;

            if (isInteractive(el)) {
                // Reuse ID if it exists (from previous pass, though usually DOM refreshes), otherwise generate
                smeId = el.getAttribute('data-sme-id');
                if (!smeId) {
                    smeId = `sme-${idCounter++}`;
                    el.setAttribute('data-sme-id', smeId);
                }
                
                // Inject Label
                const richLabel = findContextLabel(el);
                if (richLabel) {
                    el.setAttribute('data-sme-label', richLabel);
                }

                // 🔥 Spotlight Check
                if (simplifyFilled && isFieldFilled(el)) {
                    isFilled = true;
                }
            }

            // 🔥 Logic: If filled and in simplify mode, collapse it!
            if (isFilled && smeId) {
                const filledEl = document.createElement('filled-field');
                filledEl.setAttribute('data-sme-id', smeId!);
                // Keep the label so LLM knows context (e.g. "Password" followed by "Confirm Password")
                if (el.hasAttribute('data-sme-label')) {
                    filledEl.setAttribute('data-sme-label', el.getAttribute('data-sme-label')!);
                }
                filledEl.textContent = '[FILLED]';
                return filledEl;
            }

            // Standard Element Construction
            const cleanEl = document.createElement(el.tagName.toLowerCase());
            if (smeId) {
                cleanEl.setAttribute('data-sme-id', smeId);
                if (el.hasAttribute('data-sme-label')) {
                    cleanEl.setAttribute('data-sme-label', el.getAttribute('data-sme-label')!);
                }
            }

            for (const attr of ALLOWED_ATTRS) {
                if (el.hasAttribute(attr)) cleanEl.setAttribute(attr, el.getAttribute(attr)!);
            }
            
            if (el.tagName === 'LABEL' && el.hasAttribute('for')) {
                cleanEl.setAttribute('for', el.getAttribute('for')!);
            }

            // Recursion
            let hasContent = false;
            if (el.shadowRoot) {
                const shadowContainer = document.createElement('shadow-root');
                Array.from(el.shadowRoot.childNodes).forEach(child => {
                    const c = processNode(child);
                    if (c) { shadowContainer.appendChild(c); hasContent = true; }
                });
                if (hasContent) cleanEl.appendChild(shadowContainer);
            }

            Array.from(el.childNodes).forEach(child => {
                const c = processNode(child);
                if (c) { cleanEl.appendChild(c); hasContent = true; }
            });

            if (smeId) return cleanEl;
            if (hasContent || ['FORM', 'LABEL', 'H1', 'H2', 'LEGEND', 'P', 'FIELDSET', 'DIV'].includes(el.tagName)) return cleanEl; 
            return null;
        }
        return null;
    }

    // Run Process
    // @ts-ignore
    const cleanBody = processNode(document.body);
    const finalHtml = cleanBody ? (cleanBody as Element).outerHTML : "";

    // --- DEBUG GENERATOR ---
    // Note: Debug summary reflects the CURRENT state of DOM, not the folded state.
    const debugSummary: DebugItem[] = [];
    const taggedElements = document.querySelectorAll('[data-sme-id]');

    taggedElements.forEach(el => {
        const id = el.getAttribute('data-sme-id')!;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const typeAttr = el.getAttribute('type');

        let type = tag;
        if (tag === 'input') type = typeAttr || 'text';
        if (role === 'combobox') type = 'combobox';
        if (role === 'checkbox') type = 'checkbox';
        if (type === 'file') type = 'file_upload';

        let question = el.getAttribute('data-sme-label') || "(No Label)";

        let content = (el as HTMLInputElement).value || "";
        if (tag === 'button') content = el.textContent?.trim() || "";

        let optionStatus = "Ready";
        if (type === 'combobox') {
             const ariaControls = el.getAttribute('aria-controls');
             const listBox = ariaControls ? document.getElementById(ariaControls) : null;
             optionStatus = (listBox && listBox.children.length > 0) ? `[Visible: ${listBox.children.length}]` : "[Runtime Fetch Required]";
        }

        debugSummary.push({
            id,
            type,
            question: question.substring(0, 60),
            content: content.substring(0, 30),
            optionStatus
        });
    });

    return {
        html: finalHtml,
        summary: debugSummary
    };
}