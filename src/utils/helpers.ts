export const getSelector = (el: Element): string => {
    if (el.id) return `#${el.id}`;

    let path = el.tagName.toLowerCase();

    // 2. Fix CSS class splitting (filter empty strings)
    if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c.length > 0);
        if (classes.length > 0) {
            path += `.${classes.join(".")}`;
        }
    }

    const parent = el.parentElement;
    if (parent) {
        const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === el.tagName
        );
        if (siblings.length > 1) {
            const index = siblings.indexOf(el) + 1;
            path += `:nth-of-type(${index})`;
        }

        // Simplified parent path logic for brevity/robustness
        let parentPath = parent.tagName.toLowerCase();
        if (parent.id) {
            parentPath = `#${parent.id}`;
        } else if (parent.className && typeof parent.className === 'string') {
            const classes = parent.className.split(/\s+/).filter(c => c.length > 0);
            if (classes.length > 0) {
                parentPath += `.${classes.join(".")}`;
            }
        }
        path = `${parentPath} > ${path}`;
    }
    return path;
};
