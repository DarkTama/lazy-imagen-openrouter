import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  initHelp,
  openHelp,
  closeHelp,
  isHelpOpen,
  hasSeenOnboarding,
  HELP_SECTIONS,
  HAS_SEEN_ONBOARDING_KEY,
} from '../src/help.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.getElementById('helpModal')?.remove();
  closeHelpSafely();
});

afterEach(() => {
  vi.useRealTimers();
});

function closeHelpSafely() {
  try {
    closeHelp();
  } catch (e) {
    /* modal not built yet */
  }
}

describe('first-visit onboarding', () => {
  it('auto-opens in welcome mode when the flag is absent', () => {
    initHelp();
    expect(isHelpOpen()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(isHelpOpen()).toBe(true);
    expect(document.getElementById('helpModalTitle').textContent).toBe('Welcome to Imagen');
    expect(document.querySelector('.help-modal-footer').hidden).toBe(false);
  });

  it('does not auto-open when the flag is set', () => {
    localStorage.setItem(HAS_SEEN_ONBOARDING_KEY, 'true');
    initHelp();
    vi.advanceTimersByTime(500);
    expect(isHelpOpen()).toBe(false);
  });

  it('sets the flag when welcome closes with the checkbox checked', () => {
    initHelp();
    vi.advanceTimersByTime(500);
    expect(document.getElementById('helpDontShowAgain').checked).toBe(true);
    closeHelp();
    expect(hasSeenOnboarding()).toBe(true);
  });

  it('leaves the flag unset when the checkbox is unticked', () => {
    initHelp();
    vi.advanceTimersByTime(500);
    document.getElementById('helpDontShowAgain').checked = false;
    closeHelp();
    expect(localStorage.getItem(HAS_SEEN_ONBOARDING_KEY)).toBeNull();
  });

  it('never sets the flag from a normal (non-welcome) open', () => {
    localStorage.setItem(HAS_SEEN_ONBOARDING_KEY, 'true');
    initHelp();
    localStorage.removeItem(HAS_SEEN_ONBOARDING_KEY);
    openHelp();
    closeHelp();
    expect(localStorage.getItem(HAS_SEEN_ONBOARDING_KEY)).toBeNull();
  });
});

describe('help modal behavior', () => {
  beforeEach(() => {
    localStorage.setItem(HAS_SEEN_ONBOARDING_KEY, 'true');
    initHelp();
  });

  it('renders a nav button for every section', () => {
    openHelp();
    const buttons = document.querySelectorAll('.help-nav-btn');
    expect(buttons.length).toBe(HELP_SECTIONS.length);
    expect([...buttons].map(b => b.textContent)).toEqual(HELP_SECTIONS.map(s => s.title));
  });

  it('switches content when a nav button is clicked', () => {
    openHelp();
    const galleryBtn = [...document.querySelectorAll('.help-nav-btn')]
      .find(b => b.dataset.sectionId === 'gallery');
    galleryBtn.click();
    expect(document.querySelector('.help-content h3').textContent).toBe('Gallery');
    expect(galleryBtn.classList.contains('active')).toBe(true);
  });

  it('opens directly to a requested section', () => {
    openHelp('upscaler');
    expect(document.querySelector('.help-content h3').textContent).toContain('Upscaler');
  });

  it('uses the normal title outside welcome mode and hides the footer', () => {
    openHelp();
    expect(document.getElementById('helpModalTitle').textContent).toBe('Help & Guide');
    expect(document.querySelector('.help-modal-footer').hidden).toBe(true);
  });

  it('closes on Escape', () => {
    openHelp();
    expect(isHelpOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isHelpOpen()).toBe(false);
  });

  it('toggles with the ? key but not while typing', () => {
    expect(isHelpOpen()).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(isHelpOpen()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    expect(isHelpOpen()).toBe(false);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const evt = new KeyboardEvent('keydown', { key: '?', bubbles: true });
    Object.defineProperty(evt, 'target', { value: textarea });
    document.dispatchEvent(evt);
    expect(isHelpOpen()).toBe(false);
    textarea.remove();
  });
});
