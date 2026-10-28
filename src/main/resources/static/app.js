/**
 * RepoChat — Apple Pro Client Engine & GraphRAG Controller
 * Modular, clean, intern-first architecture.
 */

(() => {
  'use strict';

  // ==========================================================================
  // Application State
  // ==========================================================================
  const state = {
    repoId: null,
    repoUrl: '',
    graphData: { nodes: [], links: [] },
    selectedNode: null,
    impactedIds: new Set(),
    highlightIds: new Set(),
    isIndexing: false,
    isAsking: false,
    isPhysicsPaused: false,
    activeTab: 'chat',
  };

  // ==========================================================================
  // DOM References
  // ==========================================================================
  const $ = id => document.getElementById(id);
  const elements = {
    urlInput: $('url'),
    btnIndex: $('btn-index'),
    indexSpinner: $('index-spinner'),
    indexBtnLabel: $('index-btn-label'),
    sampleToggleBtn: $('sample-toggle-btn'),
    sampleDropdown: $('sample-dropdown'),
    statusPill: $('status-pill'),
    statusText: $('status-text'),
    metricsGroup: $('metrics-group'),
    metricMethods: $('metric-methods'),
    metricEdges: $('metric-edges'),
    canvasHero: $('canvas-hero'),
    indexingOverlay: $('indexing-overlay'),
    indexingCaption: $('indexing-caption'),
    graphSvg: d3.select('#graph'),
    nodeTooltip: $('node-tooltip'),
    ttClass: $('tt-class'),
    ttMethod: $('tt-method'),
    ttFile: $('tt-file'),
    ttLines: $('tt-lines'),
    graphSearch: $('graph-search'),
    btnZoomIn: $('btn-zoom-in'),
    btnZoomOut: $('btn-zoom-out'),
    btnZoomFit: $('btn-zoom-fit'),
    btnPhysicsToggle: $('btn-physics-toggle'),
    btnResetHighlights: $('btn-reset-highlights'),
    chatHistory: $('chat-history'),
    chatInput: $('q'),
    btnAsk: $('btn-ask'),
    tabBtnChat: $('tab-btn-chat'),
    tabBtnInspector: $('tab-btn-inspector'),
    tabBtnCatalog: $('tab-btn-catalog'),
    paneChat: $('pane-chat'),
    paneInspector: $('pane-inspector'),
    paneCatalog: $('pane-catalog'),
    inspectorEmpty: $('inspector-empty'),
    inspectorContent: $('inspector-content'),
    inspMethodName: $('insp-method-name'),
    inspClassPath: $('insp-class-path'),
    inspFilePath: $('insp-file-path'),
    inspLineRange: $('insp-line-range'),
    inspImpactCount: $('insp-impact-count'),
    btnTriggerImpact: $('btn-trigger-impact'),
    inspCallersCount: $('insp-callers-count'),
    inspCallersList: $('insp-callers-list'),
    inspCalleesCount: $('insp-callees-count'),
    inspCalleesList: $('insp-callees-list'),
    btnCopyCitation: $('btn-copy-citation'),
    btnInspAsk: $('btn-insp-ask'),
    catalogFilter: $('catalog-filter'),
    catalogList: $('catalog-list'),
    btnInternGuide: $('btn-intern-guide'),
    guideModal: $('guide-modal'),
    btnCloseGuide: $('btn-close-guide'),
    btnGuideDismiss: $('btn-guide-dismiss'),
    toast: $('toast'),
    toastMessage: $('toast-message')
  };

  // ==========================================================================
  // D3 Visualization Manager
  // ==========================================================================
  let simulation = null;
  let zoomBehavior = null;
  let svgRoot = null;
  let linkSelection = null;
  let nodeSelection = null;

  function initGraph() {
    const svg = elements.graphSvg;
    svg.selectAll('*').remove();

    svgRoot = svg.append('g').attr('class', 'graph-root');

    // Smooth D3 zoom handler
    zoomBehavior = d3.zoom()
      .scaleExtent([0.15, 5])
      .on('zoom', e => {
        svgRoot.attr('transform', e.transform);
      });

    svg.call(zoomBehavior);

    // Click on canvas background to deselect
    svg.on('click', e => {
      if (e.target.tagName === 'svg') {
        clearSelection();
      }
    });

    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    if (!simulation || !svgRoot) return;
    const svgNode = elements.graphSvg.node();
    const w = svgNode.clientWidth || 800;
    const h = svgNode.clientHeight || 600;
    simulation.force('center', d3.forceCenter(w / 2, h / 2));
    simulation.alpha(0.15).restart();
  }

  function renderGraph(graph) {
    state.graphData = graph;
    if (!svgRoot) initGraph();

    svgRoot.selectAll('*').remove();

    const svgNode = elements.graphSvg.node();
    const width = svgNode.clientWidth || 800;
    const height = svgNode.clientHeight || 600;

    // Build fast lookup index for nodes & relations
    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    graph.nodes.forEach(n => {
      n.callers = [];
      n.callees = [];
    });

    // Resolve links
    const validLinks = [];
    graph.links.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      const srcNode = nodeMap.get(srcId);
      const tgtNode = nodeMap.get(tgtId);
      if (srcNode && tgtNode) {
        srcNode.callees.push(tgtId);
        tgtNode.callers.push(srcId);
        validLinks.push({ source: srcId, target: tgtId });
      }
    });

    // D3 Force Simulation
    simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(validLinks).id(d => d.id).distance(45).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-90).distanceMax(350))
      .force('collide', d3.forceCollide().radius(14).iterations(2))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Render Edges
    linkSelection = svgRoot.append('g')
      .attr('class', 'graph-links')
      .selectAll('line')
      .data(validLinks)
      .join('line')
      .attr('class', 'graph-link');

    // Render Nodes
    nodeSelection = svgRoot.append('g')
      .attr('class', 'graph-nodes')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', 'graph-node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded)
      );

    // Node Circle
    nodeSelection.append('circle')
      .attr('r', 6)
      .attr('fill', '#52525b');

    // Node hover & click events
    nodeSelection
      .on('mouseenter', (e, d) => showTooltip(e, d))
      .on('mousemove', (e, d) => positionTooltip(e))
      .on('mouseleave', () => hideTooltip())
      .on('click', (e, d) => {
        e.stopPropagation();
        selectNode(d);
      });

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodeSelection
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Fit graph to view once simulation stabilizes
    setTimeout(() => {
      fitGraphToView();
    }, 450);

    // Update Architecture Catalog Tab
    populateCatalog(graph.nodes);
  }

  function dragStarted(event, d) {
    if (!event.active && !state.isPhysicsPaused) simulation.alphaTarget(0.2).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event, d) {
    if (!event.active && !state.isPhysicsPaused) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  function fitGraphToView() {
    if (!state.graphData.nodes.length || !svgRoot) return;
    const svg = elements.graphSvg;
    const width = svg.node().clientWidth || 800;
    const height = svg.node().clientHeight || 600;

    const bounds = svgRoot.node().getBBox();
    if (bounds.width === 0 || bounds.height === 0) return;

    const fullWidth = width;
    const fullHeight = height;
    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;

    const scale = Math.min(1.8, Math.max(0.3, 0.85 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight)));
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    svg.transition().duration(600).ease(d3.easeCubicOut)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }

  function zoomToNode(nodeId) {
    const node = state.graphData.nodes.find(n => n.id === nodeId);
    if (!node || node.x === undefined || !svgRoot) return;

    const svg = elements.graphSvg;
    const width = svg.node().clientWidth || 800;
    const height = svg.node().clientHeight || 600;

    const scale = 1.6;
    const transform = d3.zoomIdentity
      .translate(width / 2 - scale * node.x, height / 2 - scale * node.y)
      .scale(scale);

    svg.transition().duration(500).ease(d3.easeCubicOut)
      .call(zoomBehavior.transform, transform);
  }

  // ==========================================================================
  // Tooltip Logic
  // ==========================================================================
  function showTooltip(event, d) {
    const parts = d.id.split('.');
    const methodName = parts.pop();
    const className = parts.join('.');

    elements.ttClass.textContent = className || 'Method';
    elements.ttMethod.textContent = `${methodName}()`;
    elements.ttFile.textContent = d.file;
    elements.ttLines.textContent = `Lines ${d.start} - ${d.end}`;

    positionTooltip(event);
    elements.nodeTooltip.classList.add('show');
  }

  function positionTooltip(event) {
    const canvasRect = elements.canvasHero.parentElement.getBoundingClientRect();
    const x = event.clientX - canvasRect.left;
    const y = event.clientY - canvasRect.top;

    elements.nodeTooltip.style.left = `${x}px`;
    elements.nodeTooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    elements.nodeTooltip.classList.remove('show');
  }

  // ==========================================================================
  // Node Selection, Highlights & Blast Radius
  // ==========================================================================
  async function selectNode(node, shouldSwitchTab = true) {
    state.selectedNode = node;
    updateHighlights();
    zoomToNode(node.id);
    updateInspector(node);

    if (shouldSwitchTab) {
      switchTab('inspector');
    }

    // Automatically fetch impact analysis blast radius
    try {
      const impacted = await api(`/api/impact/${state.repoId}?method=${encodeURIComponent(node.id)}`);
      state.impactedIds = new Set(impacted);
      elements.inspImpactCount.textContent = impacted.length;
      updateHighlights();
    } catch (e) {
      console.warn('Impact fetch failed:', e);
    }
  }

  function clearSelection() {
    state.selectedNode = null;
    state.impactedIds.clear();
    updateHighlights();
    elements.inspectorEmpty.classList.remove('hidden');
    elements.inspectorContent.classList.add('hidden');
  }

  function setHighlightedNodes(ids) {
    state.highlightIds = new Set(ids);
    updateHighlights();
  }

  function updateHighlights() {
    if (!nodeSelection) return;

    nodeSelection.each(function(d) {
      const isSelected = state.selectedNode && state.selectedNode.id === d.id;
      const isImpacted = state.impactedIds.has(d.id);
      const isQueried = state.highlightIds.has(d.id);

      const g = d3.select(this);
      g.classed('selected', isSelected);
      g.classed('impacted', isImpacted);
      g.classed('queried', isQueried);

      const circle = g.select('circle');
      if (isSelected) {
        circle.attr('r', 9).attr('fill', '#ffffff');
      } else if (isImpacted) {
        circle.attr('r', 8).attr('fill', '#ff3b30');
      } else if (isQueried) {
        circle.attr('r', 8).attr('fill', '#ffffff');
      } else {
        circle.attr('r', 6).attr('fill', '#52525b');
      }
    });

    // Highlight links connected to active nodes
    if (linkSelection) {
      linkSelection.each(function(d) {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;
        const active = (state.selectedNode && (state.selectedNode.id === srcId || state.selectedNode.id === tgtId))
          || (state.impactedIds.has(srcId) && state.impactedIds.has(tgtId))
          || (state.highlightIds.has(srcId) && state.highlightIds.has(tgtId));
        d3.select(this).classed('active', active);
      });
    }
  }

  // ==========================================================================
  // Inspector Controller
  // ==========================================================================
  function updateInspector(node) {
    elements.inspectorEmpty.classList.add('hidden');
    elements.inspectorContent.classList.remove('hidden');

    const parts = node.id.split('.');
    const methodName = parts.pop();
    const className = parts.join('.');

    elements.inspMethodName.textContent = `${methodName}()`;
    elements.inspClassPath.textContent = className || node.id;
    elements.inspFilePath.textContent = node.file;
    elements.inspLineRange.textContent = `Lines ${node.start} - ${node.end}`;
    elements.inspImpactCount.textContent = state.impactedIds.size || '...';

    // Callers list
    const callers = node.callers || [];
    elements.inspCallersCount.textContent = callers.length;
    if (callers.length === 0) {
      elements.inspCallersList.innerHTML = '<div class="empty-relation">No callers in repository</div>';
    } else {
      elements.inspCallersList.innerHTML = callers.map(cid => `
        <div class="relation-item" onclick="window.RepoChat.jumpToNode('${escapeHtml(cid)}')">
          <span>${escapeHtml(cid)}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">caller ↗</span>
        </div>
      `).join('');
    }

    // Callees list
    const callees = node.callees || [];
    elements.inspCalleesCount.textContent = callees.length;
    if (callees.length === 0) {
      elements.inspCalleesList.innerHTML = '<div class="empty-relation">No outgoing method calls</div>';
    } else {
      elements.inspCalleesList.innerHTML = callees.map(cid => `
        <div class="relation-item" onclick="window.RepoChat.jumpToNode('${escapeHtml(cid)}')">
          <span>${escapeHtml(cid)}</span>
          <span style="font-size:10px;color:var(--text-tertiary)">calls ↘</span>
        </div>
      `).join('');
    }
  }

  // ==========================================================================
  // Architecture Catalog Builder
  // ==========================================================================
  function populateCatalog(nodes) {
    // Group nodes by Class
    const classGroups = new Map();
    nodes.forEach(n => {
      const parts = n.id.split('.');
      const methodName = parts.pop();
      const className = parts.join('.') || 'Global';
      if (!classGroups.has(className)) classGroups.set(className, []);
      classGroups.get(className).push({ id: n.id, name: methodName, node: n });
    });

    const sortedClasses = Array.from(classGroups.keys()).sort();
    renderCatalogList(sortedClasses, classGroups);

    // Live search filter for catalog
    elements.catalogFilter.oninput = () => {
      const q = elements.catalogFilter.value.trim().toLowerCase();
      if (!q) {
        renderCatalogList(sortedClasses, classGroups);
        return;
      }
      const filteredGroups = new Map();
      sortedClasses.forEach(cls => {
        const methods = classGroups.get(cls);
        const matchCls = cls.toLowerCase().includes(q);
        const matchedMethods = methods.filter(m => matchCls || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
        if (matchedMethods.length > 0) {
          filteredGroups.set(cls, matchedMethods);
        }
      });
      renderCatalogList(Array.from(filteredGroups.keys()).sort(), filteredGroups);
    };
  }

  function renderCatalogList(classes, classMap) {
    if (classes.length === 0) {
      elements.catalogList.innerHTML = '<div class="catalog-empty">No matching classes or methods</div>';
      return;
    }

    elements.catalogList.innerHTML = classes.map(cls => {
      const methods = classMap.get(cls) || [];
      return `
        <div class="catalog-class-group">
          <div class="catalog-class-title">${escapeHtml(cls)} (${methods.length})</div>
          ${methods.map(m => `
            <div class="catalog-method-item" onclick="window.RepoChat.jumpToNode('${escapeHtml(m.id)}')">
              • ${escapeHtml(m.name)}()
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
  }

  // ==========================================================================
  // HTTP API Client
  // ==========================================================================
  async function api(path, options = {}) {
    const res = await fetch(path, options);
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server returned status ${res.status}`);
    }
    if (!res.ok || data.error) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  // ==========================================================================
  // Index Repository Action
  // ==========================================================================
  async function indexRepo() {
    const rawUrl = elements.urlInput.value.trim();
    if (!rawUrl) {
      showToast('Please enter a public GitHub repository URL', 'warning');
      elements.urlInput.focus();
      return;
    }

    if (!rawUrl.startsWith('https://github.com/')) {
      showToast('URL must start with https://github.com/owner/repo', 'warning');
      return;
    }

    state.isIndexing = true;
    updateStatus('Indexing repository...', 'loading');
    setIndexButtonLoading(true);
    elements.indexingOverlay.classList.remove('hidden');

    try {
      // Step 1: POST to backend indexer
      const indexResult = await api('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rawUrl })
      });

      state.repoId = indexResult.repoId;
      state.repoUrl = rawUrl;

      // Update metrics
      elements.metricMethods.textContent = indexResult.methods;
      elements.metricEdges.textContent = indexResult.edges;
      elements.metricsGroup.classList.remove('hidden');

      // Step 2: Fetch full call graph
      const graphData = await api(`/api/graph/${state.repoId}`);
      renderGraph(graphData);

      // Hide hero and progress
      elements.canvasHero.classList.add('hidden');
      elements.indexingOverlay.classList.add('hidden');
      updateStatus(`Indexed ${indexResult.methods} methods, ${indexResult.edges} call edges`, 'ready');
      showToast('Repository analysis & GraphRAG ready!', 'success');

      // Append assistant welcome into chat
      addAssistantMessage(`
Successfully indexed **${escapeHtml(rawUrl.split('/').slice(-2).join('/'))}**!
- Parsed **${indexResult.methods}** Java methods
- Discovered **${indexResult.edges}** topological call edges
- Vector embeddings saved to PGVector

You can now ask questions about the architecture, or click any node in the graph to inspect blast radiuses.
      `);
    } catch (err) {
      console.error(err);
      updateStatus('Index failed: ' + err.message, 'error');
      showToast(err.message, 'error');
      elements.indexingOverlay.classList.add('hidden');
    } finally {
      state.isIndexing = false;
      setIndexButtonLoading(false);
    }
  }

  // ==========================================================================
  // Ask Chat Action
  // ==========================================================================
  async function ask() {
    if (!state.repoId) {
      showToast('Please index a repository first before asking questions.', 'warning');
      elements.urlInput.focus();
      return;
    }

    const question = elements.chatInput.value.trim();
    if (!question || state.isAsking) return;

    elements.chatInput.value = '';
    addUserMessage(question);

    const thinkingBubble = addThinkingBubble();
    state.isAsking = true;
    elements.btnAsk.disabled = true;

    try {
      const response = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId: state.repoId, question })
      });

      thinkingBubble.remove();
      addAssistantMessage(response.answer);

      // Highlight active context nodes in white
      if (response.highlight && response.highlight.length > 0) {
        setHighlightedNodes(response.highlight);
        showToast(`Highlighted ${response.highlight.length} related context methods in graph`, 'info');
      }
    } catch (err) {
      thinkingBubble.remove();
      addAssistantMessage(`**Error answering inquiry:** ${escapeHtml(err.message)}`);
      showToast(err.message, 'error');
    } finally {
      state.isAsking = false;
      elements.btnAsk.disabled = false;
      elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    }
  }

  function askPreset(prompt) {
    if (!state.repoId) {
      showToast('Index a repository first to ask questions.', 'warning');
      return;
    }
    switchTab('chat');
    elements.chatInput.value = prompt;
    ask();
  }

  // ==========================================================================
  // Chat Bubble Rendering & Citation Enhancer
  // ==========================================================================
  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-user';
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
  }

  function addAssistantMessage(rawText) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-assistant';

    // Parse Markdown safely
    let formattedHtml = '';
    if (typeof window.marked !== 'undefined' && window.marked.parse) {
      formattedHtml = window.marked.parse(rawText);
    } else {
      formattedHtml = `<p>${escapeHtml(rawText).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
    }

    // Format citations like [path/File.java:10-50] into clickable Apple pill buttons
    const citationRegex = /\[([^\s\]:]+\.java):(\d+)-(\d+)\]/g;
    formattedHtml = formattedHtml.replace(citationRegex, (match, file, start, end) => {
      const baseName = file.split('/').pop();
      return `<button class="citation-pill" onclick="window.RepoChat.focusCitation('${escapeHtml(baseName)}', ${start}, ${end})" title="Zoom to ${escapeHtml(file)} lines ${start}-${end}">
        <span class="citation-icon">📄</span> ${escapeHtml(baseName)}:${start}-${end}
      </button>`;
    });

    div.innerHTML = `
      <div class="msg-header">
        <div class="assistant-avatar">✦</div>
        <span class="assistant-name">RepoChat Intelligence</span>
      </div>
      <div class="msg-bubble">${formattedHtml}</div>
    `;

    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
  }

  function addThinkingBubble() {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-assistant chat-msg-thinking';
    div.innerHTML = `
      <div class="msg-header">
        <div class="assistant-avatar">✦</div>
        <span class="assistant-name">Consulting Graph & Vectors...</span>
      </div>
      <div class="msg-bubble">
        <span>Reasoning across AST call topology</span>
        <div class="thinking-dots"><span></span><span></span><span></span></div>
      </div>
    `;
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    return div;
  }

  // ==========================================================================
  // Citation Navigation Handler
  // ==========================================================================
  function focusCitation(fileName, startLine, endLine) {
    if (!state.graphData.nodes.length) return;

    // Find node matching file and overlapping line range
    const match = state.graphData.nodes.find(n => {
      const base = n.file.split('/').pop();
      return (base === fileName || n.file.endsWith(fileName)) &&
        ((startLine >= n.start && startLine <= n.end) || (endLine >= n.start && endLine <= n.end) || (n.start >= startLine && n.end <= endLine));
    }) || state.graphData.nodes.find(n => n.file.endsWith(fileName));

    if (match) {
      selectNode(match, true);
      showToast(`Spotlighted method: ${match.id} (${fileName})`, 'info');
    } else {
      showToast(`Referenced file: ${fileName} (Lines ${startLine}-${endLine})`, 'info');
    }
  }

  // ==========================================================================
  // Tab Switcher
  // ==========================================================================
  function switchTab(tabName) {
    state.activeTab = tabName;
    const tabs = [
      { btn: elements.tabBtnChat, pane: elements.paneChat, name: 'chat' },
      { btn: elements.tabBtnInspector, pane: elements.paneInspector, name: 'inspector' },
      { btn: elements.tabBtnCatalog, pane: elements.paneCatalog, name: 'catalog' }
    ];

    tabs.forEach(t => {
      const active = t.name === tabName;
      t.btn.classList.toggle('active', active);
      t.btn.setAttribute('aria-selected', active);
      t.pane.classList.toggle('active', active);
    });
  }

  // ==========================================================================
  // Sample Repos Selection
  // ==========================================================================
  function selectSampleRepo(url) {
    elements.urlInput.value = url;
    elements.sampleDropdown.classList.remove('show');
    indexRepo();
  }

  // ==========================================================================
  // Toast Notification System
  // ==========================================================================
  let toastTimer = null;
  function showToast(message, type = 'info') {
    clearTimeout(toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.classList.remove('hidden');

    const icons = {
      info: 'ℹ',
      success: '✓',
      warning: '⚠',
      error: '✕'
    };
    const iconEl = $('toast-icon');
    if (iconEl) iconEl.textContent = icons[type] || 'ℹ';

    toastTimer = setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, 3400);
  }

  // ==========================================================================
  // Status Indicator
  // ==========================================================================
  function updateStatus(text, stateType = 'idle') {
    elements.statusText.textContent = text;
    elements.statusPill.className = `status-pill status-${stateType}`;
  }

  function setIndexButtonLoading(loading) {
    elements.btnIndex.disabled = loading;
    elements.indexSpinner.style.display = loading ? 'inline-block' : 'none';
    elements.indexBtnLabel.textContent = loading ? 'Analyzing...' : 'Analyze Repo';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // ==========================================================================
  // Global Event Listeners & Shortcuts
  // ==========================================================================
  function setupEventListeners() {
    // Repo input Enter key
    elements.urlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') indexRepo();
    });

    // Chat input Enter key (Shift+Enter for newline)
    elements.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ask();
      }
    });

    // Sample Repos Dropdown Toggle
    elements.sampleToggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      elements.sampleDropdown.classList.toggle('show');
    });

    document.querySelectorAll('.sample-option').forEach(btn => {
      btn.addEventListener('click', () => {
        selectSampleRepo(btn.dataset.url);
      });
    });

    document.addEventListener('click', () => {
      elements.sampleDropdown.classList.remove('show');
    });

    // Tab Switchers
    elements.tabBtnChat.addEventListener('click', () => switchTab('chat'));
    elements.tabBtnInspector.addEventListener('click', () => switchTab('inspector'));
    elements.tabBtnCatalog.addEventListener('click', () => switchTab('catalog'));

    // Graph HUD controls
    elements.btnZoomIn.addEventListener('click', () => {
      elements.graphSvg.transition().duration(250).call(zoomBehavior.scaleBy, 1.3);
    });

    elements.btnZoomOut.addEventListener('click', () => {
      elements.graphSvg.transition().duration(250).call(zoomBehavior.scaleBy, 0.7);
    });

    elements.btnZoomFit.addEventListener('click', fitGraphToView);

    elements.btnPhysicsToggle.addEventListener('click', () => {
      if (!simulation) return;
      state.isPhysicsPaused = !state.isPhysicsPaused;
      if (state.isPhysicsPaused) {
        simulation.stop();
        elements.btnPhysicsToggle.style.color = 'var(--apple-amber)';
        showToast('Graph physics paused', 'info');
      } else {
        simulation.alpha(0.2).restart();
        elements.btnPhysicsToggle.style.color = 'var(--text-secondary)';
        showToast('Graph physics resumed', 'info');
      }
    });

    elements.btnResetHighlights.addEventListener('click', () => {
      clearSelection();
      state.highlightIds.clear();
      updateHighlights();
      showToast('Cleared graph highlights', 'info');
    });

    // Graph Search Spotlight
    elements.graphSearch.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        nodeSelection && nodeSelection.style('opacity', 1);
        linkSelection && linkSelection.style('opacity', 1);
        return;
      }
      nodeSelection && nodeSelection.style('opacity', d => d.id.toLowerCase().includes(q) || d.file.toLowerCase().includes(q) ? 1 : 0.15);
      linkSelection && linkSelection.style('opacity', 0.1);
    });

    elements.graphSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim().toLowerCase();
        const found = state.graphData.nodes.find(n => n.id.toLowerCase().includes(q));
        if (found) selectNode(found);
      }
    });

    // Inspector Action Buttons
    elements.btnTriggerImpact.addEventListener('click', () => {
      if (!state.selectedNode) return;
      showToast(`Blast radius: ${state.impactedIds.size} callers highlighted in red`, 'warning');
    });

    elements.btnCopyCitation.addEventListener('click', () => {
      if (!state.selectedNode) return;
      const citation = `[${state.selectedNode.file}:${state.selectedNode.start}-${state.selectedNode.end}]`;
      navigator.clipboard.writeText(citation).then(() => {
        showToast(`Copied citation: ${citation}`, 'success');
      });
    });

    elements.btnInspAsk.addEventListener('click', () => {
      if (!state.selectedNode) return;
      switchTab('chat');
      elements.chatInput.value = `Explain the purpose and architecture of method ${state.selectedNode.id} in ${state.selectedNode.file}`;
      ask();
    });

    // Intern Quick Guide Modal
    elements.btnInternGuide.addEventListener('click', () => {
      elements.guideModal.classList.remove('hidden');
    });

    elements.btnCloseGuide.addEventListener('click', () => {
      elements.guideModal.classList.add('hidden');
    });

    elements.btnGuideDismiss.addEventListener('click', () => {
      elements.guideModal.classList.add('hidden');
    });

    elements.guideModal.addEventListener('click', e => {
      if (e.target === elements.guideModal) {
        elements.guideModal.classList.add('hidden');
      }
    });

    // Global Keyboard Shortcuts (Apple style ⌘K / Ctrl+K and Esc)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        elements.graphSearch.focus();
        elements.graphSearch.select();
      } else if (e.key === 'Escape') {
        elements.guideModal.classList.add('hidden');
        elements.sampleDropdown.classList.remove('show');
        clearSelection();
      }
    });
  }

  // ==========================================================================
  // Public Interface for Inline Handlers
  // ==========================================================================
  window.RepoChat = {
    jumpToNode: id => {
      const node = state.graphData.nodes.find(n => n.id === id);
      if (node) selectNode(node);
    },
    focusCitation: (file, start, end) => focusCitation(file, start, end),
  };

  window.indexRepo = indexRepo;
  window.ask = ask;
  window.askPreset = askPreset;
  window.selectSampleRepo = selectSampleRepo;

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    initGraph();
    setupEventListeners();
  });
})();
