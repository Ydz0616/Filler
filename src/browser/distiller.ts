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

export function distillPage(): DistillResult {
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

    // 🔥 NEW: Context Hunter (上下文猎手)
    function findContextLabel(el: Element): string {
        // 1. 尝试直接的 Label / Aria
        let label = "";
        if (el.tagName === 'LABEL') return el.textContent?.trim() || "";
        
        const id = el.id;
        if (id) {
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) label = labelEl.textContent?.trim() || "";
        }
        if (!label) label = el.getAttribute('aria-label') || "";
        
        // 2. 如果 Label 太弱（Attach, Select...），或者是空的，往上找 Group/Fieldset
        const weakLabels = ['attach', 'select...', 'select', 'toggle flyout', ''];
        if (weakLabels.includes(label.toLowerCase())) {
            // 尝试找 fieldset legend
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) return legend.textContent?.trim() + " > " + label;
            }

            // 尝试找 role="group" (Greenhouse Resume 就在这里)
            const group = el.closest('[role="group"]');
            if (group) {
                // 找 group 里的第一个文本节点或者 header
                // Greenhouse 特例：<div role="group"><div>Resume/CV</div>...</div>
                // 简单的策略：拿 group 的 aria-label 或者第一个 div 的字
                const groupLabel = group.getAttribute('aria-label') || group.firstElementChild?.textContent?.trim();
                if (groupLabel) return groupLabel + " > " + label;
            }
        }

        // 3. 按钮特例：读取按钮内部文字
        if (el.tagName === 'BUTTON' && !label) {
            return el.textContent?.trim() || "";
        }

        return label;
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
            if (isInteractive(el)) {
                smeId = `sme-${idCounter++}`;
                el.setAttribute('data-sme-id', smeId);
                
                // 🔥 NEW: 把增强后的 Label 注入到 DOM 里，帮助 LLM！
                const richLabel = findContextLabel(el);
                if (richLabel) {
                    el.setAttribute('data-sme-label', richLabel); // 这会直接出现在 HTML 快照里
                }
            }

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
            if (hasContent || ['FORM', 'LABEL', 'H1', 'H2', 'LEGEND', 'P', 'FIELDSET', 'DIV'].includes(el.tagName)) return cleanEl; // 稍微放宽 DIV 以保留结构
            return null;
        }
        return null;
    }

    // Run Process
    const cleanBody = processNode(document.body);
    const finalHtml = cleanBody ? (cleanBody as Element).outerHTML : "";

    // --- DEBUG GENERATOR (Using the new data-sme-label) ---
    const debugSummary: DebugItem[] = [];
    const taggedElements = document.querySelectorAll('[data-sme-id]');

    taggedElements.forEach(el => {
        const id = el.getAttribute('data-sme-id')!;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const typeAttr = el.getAttribute('type');

        // Type Logic
        let type = tag;
        if (tag === 'input') type = typeAttr || 'text';
        if (role === 'combobox') type = 'combobox';
        if (role === 'checkbox') type = 'checkbox';
        if (type === 'file') type = 'file_upload';

        // Question Logic (Directly read our injected smart label)
        let question = el.getAttribute('data-sme-label') || "(No Label)";

        // Content Logic
        let content = (el as HTMLInputElement).value || "";
        if (tag === 'button') content = el.textContent?.trim() || ""; // Button text as content

        // Option Logic
        let optionStatus = "Ready";
        if (type === 'combobox') {
             const ariaControls = el.getAttribute('aria-controls');
             const listBox = ariaControls ? document.getElementById(ariaControls) : null;
             optionStatus = (listBox && listBox.children.length > 0) ? `[Visible: ${listBox.children.length}]` : "[Runtime Fetch Required]";
        }

        debugSummary.push({
            id,
            type,
            question: question.substring(0, 60), // Slightly longer
            content: content.substring(0, 30),
            optionStatus
        });
    });

    return {
        html: finalHtml,
        summary: debugSummary
    };
}