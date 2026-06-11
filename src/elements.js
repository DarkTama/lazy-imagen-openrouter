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
    elements.tokenSaverTip = document.getElementById('tokenSaverTip');
    elements.owSwapBtn = document.getElementById('owSwapBtn');
    elements.owRecents = document.getElementById('owRecents');
    elements.owRecentsThumbs = document.getElementById('owRecentsThumbs');
    elements.owTransferCount = document.getElementById('owTransferCount');
    elements.owTransferAll = document.getElementById('owTransferAll');
    elements.owTransferNone = document.getElementById('owTransferNone');
    elements.owPresets = document.getElementById('owPresets');
    elements.owStaleBadge = document.getElementById('owStaleBadge');
    elements.owPromptCount = document.getElementById('owPromptCount');
    elements.owCopyPrompt = document.getElementById('owCopyPrompt');
    elements.owReanalyze = document.getElementById('owReanalyze');
    elements.owReadiness = document.getElementById('owReadiness');
    elements.iterateAsSource = document.getElementById('iterateAsSource');

    // Sidebar Toggle (mobile)
    elements.sidebarToggle = document.getElementById('sidebarToggle');
    elements.sidebar = document.querySelector('.sidebar');

    // Theme
    elements.themeToggleBtn = document.getElementById('themeToggleBtn');

    // Help
    elements.helpBtn = document.getElementById('helpBtn');

    // History
    elements.historyBtn = document.getElementById('historyBtn');

    // Auto-retry
    elements.autoRetryToggle = document.getElementById('autoRetryToggle');

    // Export/Import
    elements.exportGallery = document.getElementById('exportGallery');
    elements.importGalleryInput = document.getElementById('importGalleryInput');

    // Image Tools
    elements.imageToolsBtn = document.getElementById('imageToolsBtn');
    elements.editImage = document.getElementById('editImage');
    elements.toolsModal = document.getElementById('toolsModal');
    elements.toolsOverlay = document.getElementById('toolsOverlay');
    elements.toolsClose = document.getElementById('toolsClose');
    elements.toolsTabUpscale = document.getElementById('toolsTabUpscale');
    elements.toolsTabBg = document.getElementById('toolsTabBg');
    elements.toolsEmpty = document.getElementById('toolsEmpty');
    elements.toolsFileInput = document.getElementById('toolsFileInput');
    elements.toolsUploadBtn = document.getElementById('toolsUploadBtn');
    elements.toolsStage = document.getElementById('toolsStage');
    elements.toolsCanvas = document.getElementById('toolsCanvas');
    elements.toolsInfo = document.getElementById('toolsInfo');
    elements.toolsProgress = document.getElementById('toolsProgress');
    elements.toolsProgressLabel = document.getElementById('toolsProgressLabel');
    elements.toolsCancel = document.getElementById('toolsCancel');
    elements.upscalePanel = document.getElementById('upscalePanel');
    elements.upscaleScaleGroup = document.getElementById('upscaleScaleGroup');
    elements.upscaleSharpen = document.getElementById('upscaleSharpen');
    elements.upscaleRun = document.getElementById('upscaleRun');
    elements.upscaleCompareToggle = document.getElementById('upscaleCompareToggle');
    elements.compareSliderRow = document.getElementById('compareSliderRow');
    elements.compareSlider = document.getElementById('compareSlider');
    elements.toolsChangeImage = document.getElementById('toolsChangeImage');
    elements.upscaleDownload = document.getElementById('upscaleDownload');
    elements.upscaleSave = document.getElementById('upscaleSave');
    elements.bgPanel = document.getElementById('bgPanel');
    elements.bgTolerance = document.getElementById('bgTolerance');
    elements.bgToleranceValue = document.getElementById('bgToleranceValue');
    elements.bgAutoDetect = document.getElementById('bgAutoDetect');
    elements.bgAiAssist = document.getElementById('bgAiAssist');
    elements.bgBrushModeGroup = document.getElementById('bgBrushModeGroup');
    elements.bgSmartBrush = document.getElementById('bgSmartBrush');
    elements.bgBrushSize = document.getElementById('bgBrushSize');
    elements.bgBrushSizeValue = document.getElementById('bgBrushSizeValue');
    elements.bgFeather = document.getElementById('bgFeather');
    elements.bgFeatherValue = document.getElementById('bgFeatherValue');
    elements.bgUndo = document.getElementById('bgUndo');
    elements.bgRedo = document.getElementById('bgRedo');
    elements.bgReset = document.getElementById('bgReset');
    elements.bgDownload = document.getElementById('bgDownload');
    elements.bgSave = document.getElementById('bgSave');
}
