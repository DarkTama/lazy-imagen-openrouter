/**
 * Shared mutable DOM reference cache.
 * Breaks circular dependencies since many modules need element references.
 */

export const elements = {};

export function initElements() {
    // Sidebar
    elements.modelSelectContainer = document.getElementById('modelSelectContainer');
    elements.modelSelectTrigger = document.getElementById('modelSelectTrigger');
    elements.modelSelectValue = document.getElementById('modelSelectValue');
    elements.modelSelectOptions = document.getElementById('modelSelectOptions');
    elements.geminiOptions = document.getElementById('geminiOptions');
    elements.apiKey = document.getElementById('apiKey');
    elements.saveApiKey = document.getElementById('saveApiKey');
    elements.clearApiKey = document.getElementById('clearApiKey');
    elements.rememberKeyToggle = document.getElementById('rememberKeyToggle');
    elements.imageCount = document.getElementById('imageCount');
    elements.decreaseCount = document.getElementById('decreaseCount');
    elements.increaseCount = document.getElementById('increaseCount');
    elements.clearReferences = document.getElementById('clearReferences');
    elements.referenceSlots = document.getElementById('referenceSlots');

    // Main Content
    elements.promptInput = document.getElementById('promptInput');
    elements.charCount = document.getElementById('charCount');
    elements.generateBtn = document.getElementById('generateBtn');
    elements.gallery = document.getElementById('gallery');
    elements.galleryEmpty = document.getElementById('galleryEmpty');
    elements.clearGallery = document.getElementById('clearGallery');

    // Modal
    elements.imageModal = document.getElementById('imageModal');
    elements.modalOverlay = document.getElementById('modalOverlay');
    elements.modalClose = document.getElementById('modalClose');
    elements.modalImage = document.getElementById('modalImage');
    elements.modalMetadata = document.getElementById('modalMetadata');
    elements.useAsReference = document.getElementById('useAsReference');
    elements.recreateImage = document.getElementById('recreateImage');
    elements.downloadImage = document.getElementById('downloadImage');

    // Orchestrator
    elements.orchestratorSection = document.getElementById('orchestratorSection');
    elements.orchestratorToggle = document.getElementById('orchestratorToggle');
    elements.orchestratorWorkspace = document.getElementById('orchestratorWorkspace');
    elements.orchestratorAssembleBtn = document.getElementById('orchestratorAssembleBtn');
    elements.orchestratorGenerateBtn = document.getElementById('orchestratorGenerateBtn');
    elements.generationModelInfo = document.getElementById('generationModelInfo');
    elements.sourceDropzone = document.getElementById('sourceDropzone');
    elements.sourceInput = document.getElementById('sourceInput');
    elements.sourceThumb = document.getElementById('sourceThumb');
    elements.sourceClear = document.getElementById('sourceClear');
    elements.referenceDropzone = document.getElementById('referenceDropzone');
    elements.referenceInput = document.getElementById('referenceInput');
    elements.referenceThumb = document.getElementById('referenceThumb');
    elements.referenceClear = document.getElementById('referenceClear');
    elements.owToggleGrid = document.getElementById('owToggleGrid');
    elements.identityLock = document.getElementById('identityLock');
    elements.creativitySlider = document.getElementById('creativitySlider');
    elements.creativityValue = document.getElementById('creativityValue');
    elements.visionModelContainer = document.getElementById('visionModelContainer');
    elements.visionModelTrigger = document.getElementById('visionModelTrigger');
    elements.visionModelValue = document.getElementById('visionModelValue');
    elements.visionModelOptions = document.getElementById('visionModelOptions');
    elements.visionModelCustom = document.getElementById('visionModelCustom');
    elements.visionModelChip = document.getElementById('visionModelChip');
    elements.owSubjectContextSection = document.getElementById('owSubjectContextSection');
    elements.owAdvancedSection = document.getElementById('owAdvancedSection');
    elements.owErrorPanel = document.getElementById('owErrorPanel');
    elements.owErrorClose = document.getElementById('owErrorClose');
    elements.autoCompressToggle = document.getElementById('autoCompressToggle');
    elements.subjectContext = document.getElementById('subjectContext');
    elements.researchSubjectBtn = document.getElementById('researchSubjectBtn');
    elements.researchModelSelect = document.getElementById('researchModelSelect');
    elements.orchestratorNotes = document.getElementById('orchestratorNotes');
    elements.assembledPromptPreview = document.getElementById('assembledPromptPreview');

    // Sidebar Toggle (mobile)
    elements.sidebarToggle = document.getElementById('sidebarToggle');
    elements.sidebar = document.querySelector('.sidebar');

    // Theme
    elements.themeToggleBtn = document.getElementById('themeToggleBtn');

    // History
    elements.historyBtn = document.getElementById('historyBtn');
}
