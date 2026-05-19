/**
 * Keyboard navigation and accessibility for custom selects.
 */

export function initAccessibility() {
    const triggers = document.querySelectorAll('.custom-select-trigger');
    triggers.forEach(trigger => {
        trigger.addEventListener('keydown', handleTriggerKeydown);
    });
}

function handleTriggerKeydown(e) {
    const trigger = e.currentTarget;
    const container = trigger.closest('.custom-select');
    if (!container) return;

    const optionsContainer = container.querySelector('.custom-select-options');
    if (!optionsContainer) return;

    const isOpen = container.classList.contains('open');

    switch (e.key) {
        case 'Enter':
        case ' ':
            e.preventDefault();
            if (!isOpen) {
                container.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                highlightFirst(optionsContainer);
            } else {
                selectHighlighted(container, trigger, optionsContainer);
            }
            break;

        case 'ArrowDown':
            e.preventDefault();
            if (!isOpen) {
                container.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                highlightFirst(optionsContainer);
            } else {
                moveHighlight(optionsContainer, 1);
            }
            break;

        case 'ArrowUp':
            e.preventDefault();
            if (isOpen) {
                moveHighlight(optionsContainer, -1);
            }
            break;

        case 'Escape':
            e.preventDefault();
            if (isOpen) {
                container.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
                clearHighlight(optionsContainer);
            }
            break;
    }
}

function getOptions(optionsContainer) {
    return Array.from(optionsContainer.querySelectorAll('.custom-select-option'));
}

function highlightFirst(optionsContainer) {
    const options = getOptions(optionsContainer);
    clearHighlight(optionsContainer);
    const selected = options.find(o => o.classList.contains('selected')) || options[0];
    if (selected) selected.classList.add('data-highlighted');
}

function clearHighlight(optionsContainer) {
    const options = getOptions(optionsContainer);
    options.forEach(o => o.classList.remove('data-highlighted'));
}

function moveHighlight(optionsContainer, direction) {
    const options = getOptions(optionsContainer);
    if (options.length === 0) return;

    const currentIndex = options.findIndex(o => o.classList.contains('data-highlighted'));
    let nextIndex;

    if (currentIndex === -1) {
        nextIndex = direction > 0 ? 0 : options.length - 1;
    } else {
        nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = options.length - 1;
        if (nextIndex >= options.length) nextIndex = 0;
    }

    clearHighlight(optionsContainer);
    options[nextIndex].classList.add('data-highlighted');
    options[nextIndex].scrollIntoView({ block: 'nearest' });
}

function selectHighlighted(container, trigger, optionsContainer) {
    const highlighted = optionsContainer.querySelector('.custom-select-option.data-highlighted');
    if (highlighted) {
        highlighted.click();
    }
    container.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    clearHighlight(optionsContainer);
}
