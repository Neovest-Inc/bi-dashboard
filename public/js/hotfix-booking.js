/**
 * Hotfix Booking Module
 * 
 * Handles hotfix version booking and version matrix display.
 */
(function() {
  // State
  let initialized = false;
  let fieldOptionsLoaded = false;
  let nextVersion = null;
  let selectedComponents = [];
  let selectedClients = [];
  let availableComponents = [];
  let availableClients = [];

  // DOM Elements
  let pillBtns;
  let bookView;
  let matrixView;
  let loadingEl;
  let matrixLoadingEl;
  let nextVersionEl;
  let componentToggle;
  let componentDropdown;
  let clientToggle;
  let clientDropdown;
  let bookBtn;
  let bookingsListEl;
  let matrixTableEl;
  let refreshMatrixBtn;

  /**
   * Initialize the module
   */
  function init() {
    if (initialized) return;

    // Get DOM elements
    pillBtns = document.querySelectorAll('.hb-pill-toggle .pill-btn');
    bookView = document.getElementById('hbBookView');
    matrixView = document.getElementById('hbMatrixView');
    loadingEl = document.getElementById('hbLoading');
    matrixLoadingEl = document.getElementById('hbMatrixLoading');
    nextVersionEl = document.getElementById('hbNextVersion');
    componentToggle = document.getElementById('hbComponentToggle');
    componentDropdown = document.getElementById('hbComponentDropdown');
    clientToggle = document.getElementById('hbClientToggle');
    clientDropdown = document.getElementById('hbClientDropdown');
    bookBtn = document.getElementById('hbBookBtn');
    bookingsListEl = document.getElementById('hbBookingsList');
    matrixTableEl = document.getElementById('hbMatrixTable');
    refreshMatrixBtn = document.getElementById('hbRefreshMatrix');

    if (!pillBtns.length) return;

    // Pill toggle event listeners
    pillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        pillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const view = btn.dataset.view;
        if (view === 'book') {
          bookView.style.display = 'block';
          matrixView.style.display = 'none';
        } else {
          bookView.style.display = 'none';
          matrixView.style.display = 'block';
          loadVersionMatrix();
        }
      });
    });

    // Multi-select dropdowns
    if (componentToggle) {
      componentToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('component');
      });
    }

    if (clientToggle) {
      clientToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('client');
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      closeAllDropdowns();
    });

    // Book button
    if (bookBtn) {
      bookBtn.addEventListener('click', bookHotfix);
    }

    // Refresh matrix button
    if (refreshMatrixBtn) {
      refreshMatrixBtn.addEventListener('click', loadVersionMatrix);
    }

    initialized = true;
  }

  /**
   * Called when tab is shown
   */
  function onTabShow() {
    if (!fieldOptionsLoaded) {
      loadFieldOptions();
      loadNextVersion();
      loadBookings();
    }
  }

  /**
   * Toggle dropdown visibility
   */
  function toggleDropdown(type) {
    closeAllDropdowns();
    const dropdown = type === 'component' ? componentDropdown : clientDropdown;
    dropdown.classList.toggle('open');
  }

  /**
   * Close all dropdowns
   */
  function closeAllDropdowns() {
    if (componentDropdown) componentDropdown.classList.remove('open');
    if (clientDropdown) clientDropdown.classList.remove('open');
  }

  /**
   * Load field options (components and clients) from API
   */
  async function loadFieldOptions() {
    showLoading(true);
    try {
      const response = await fetch('/api/hotfix-booking/field-options');
      const data = await response.json();

      if (data.error) {
        console.error('Field options error:', data.error);
        return;
      }

      availableComponents = data.components || [];
      availableClients = data.clients || [];

      renderComponentDropdown();
      renderClientDropdown();
      fieldOptionsLoaded = true;
    } catch (error) {
      console.error('Failed to load field options:', error);
    } finally {
      showLoading(false);
    }
  }

  /**
   * Render component multi-select dropdown
   */
  function renderComponentDropdown() {
    if (!componentDropdown) return;

    // Add search input at the top
    let html = `<div class="hb-dropdown-search">
      <input type="text" class="hb-search-input" placeholder="Search components..." data-target="component">
    </div>`;
    
    html += `<div class="hb-dropdown-items">`;
    html += availableComponents.map(comp => `
      <div class="hb-dropdown-item ${selectedComponents.includes(comp.name) ? 'selected' : ''}" 
           data-value="${Utils.escapeHtml(comp.name)}">
        <span class="hb-check-icon material-icons">${selectedComponents.includes(comp.name) ? 'check_box' : 'check_box_outline_blank'}</span>
        <span class="hb-item-label">${Utils.escapeHtml(comp.name)}</span>
      </div>
    `).join('');
    html += `</div>`;
    
    componentDropdown.innerHTML = html;

    // Add click listeners to items
    componentDropdown.querySelectorAll('.hb-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.dataset.value;
        toggleSelection('component', value);
      });
    });

    // Add search listener
    const searchInput = componentDropdown.querySelector('.hb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterDropdownItems(componentDropdown, e.target.value);
      });
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  /**
   * Render client multi-select dropdown
   */
  function renderClientDropdown() {
    if (!clientDropdown) return;

    // Add search input at the top
    let html = `<div class="hb-dropdown-search">
      <input type="text" class="hb-search-input" placeholder="Search clients..." data-target="client">
    </div>`;
    
    html += `<div class="hb-dropdown-items">`;
    html += availableClients.map(client => `
      <div class="hb-dropdown-item ${selectedClients.includes(client.value) ? 'selected' : ''}" 
           data-value="${Utils.escapeHtml(client.value)}">
        <span class="hb-check-icon material-icons">${selectedClients.includes(client.value) ? 'check_box' : 'check_box_outline_blank'}</span>
        <span class="hb-item-label">${Utils.escapeHtml(client.value)}</span>
      </div>
    `).join('');
    html += `</div>`;
    
    clientDropdown.innerHTML = html;

    // Add click listeners to items
    clientDropdown.querySelectorAll('.hb-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.dataset.value;
        toggleSelection('client', value);
      });
    });

    // Add search listener
    const searchInput = clientDropdown.querySelector('.hb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterDropdownItems(clientDropdown, e.target.value);
      });
      searchInput.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  /**
   * Toggle selection of an item
   */
  function toggleSelection(type, value) {
    const selected = type === 'component' ? selectedComponents : selectedClients;
    const dropdown = type === 'component' ? componentDropdown : clientDropdown;
    
    const index = selected.indexOf(value);
    if (index === -1) {
      selected.push(value);
    } else {
      selected.splice(index, 1);
    }

    // Update visual state of the clicked item
    const item = dropdown.querySelector(`.hb-dropdown-item[data-value="${CSS.escape(value)}"]`);
    if (item) {
      const icon = item.querySelector('.hb-check-icon');
      if (selected.includes(value)) {
        item.classList.add('selected');
        icon.textContent = 'check_box';
      } else {
        item.classList.remove('selected');
        icon.textContent = 'check_box_outline_blank';
      }
    }

    updateToggleText(type);
  }

  /**
   * Filter dropdown items based on search query
   */
  function filterDropdownItems(dropdown, query) {
    const items = dropdown.querySelectorAll('.hb-dropdown-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
      const label = item.querySelector('.hb-item-label').textContent.toLowerCase();
      item.style.display = label.includes(lowerQuery) ? 'flex' : 'none';
    });
  }

  /**
   * Update the toggle button text based on selections
   */
  function updateToggleText(type) {
    const selected = type === 'component' ? selectedComponents : selectedClients;
    const toggle = type === 'component' ? componentToggle : clientToggle;
    const placeholder = type === 'component' ? 'Select components...' : 'Select clients...';

    if (!toggle) return;

    // Use first child span (more reliable than class selector)
    const textSpan = toggle.querySelector('span:first-child');
    if (!textSpan) return;

    if (selected.length === 0) {
      textSpan.textContent = placeholder;
      textSpan.className = 'hb-select-text placeholder';
    } else {
      textSpan.textContent = `${selected.length} selected`;
      textSpan.className = 'hb-select-text';
    }
  }

  /**
   * Load next available version
   */
  async function loadNextVersion() {
    try {
      const response = await fetch('/api/hotfix-booking/next-version');
      const data = await response.json();

      if (data.error && !data.nextVersion) {
        nextVersionEl.textContent = 'N/A';
        nextVersionEl.title = data.error;
        return;
      }

      nextVersion = data.nextVersion;
      nextVersionEl.textContent = nextVersion;
      nextVersionEl.title = `Current highest: ${data.currentHighest}`;
    } catch (error) {
      console.error('Failed to load next version:', error);
      nextVersionEl.textContent = 'Error';
    }
  }

  /**
   * Load existing bookings
   */
  async function loadBookings() {
    try {
      const response = await fetch('/api/hotfix-booking/bookings');
      const data = await response.json();
      renderBookingsList(data.bookings || []);
    } catch (error) {
      console.error('Failed to load bookings:', error);
    }
  }

  /**
   * Render bookings list
   */
  function renderBookingsList(bookings) {
    if (!bookingsListEl) return;

    if (bookings.length === 0) {
      bookingsListEl.innerHTML = '<p class="hb-no-bookings">No bookings yet.</p>';
      return;
    }

    // Sort by most recent first
    const sorted = [...bookings].sort((a, b) => 
      new Date(b.bookedAt) - new Date(a.bookedAt)
    );

    bookingsListEl.innerHTML = sorted.slice(0, 10).map(booking => `
      <div class="hb-booking-item">
        <div class="hb-booking-version">${Utils.escapeHtml(booking.version)}</div>
        <div class="hb-booking-details">
          <div class="hb-booking-tags">
            ${booking.components.map(c => `<span class="hb-tag hb-component-tag">${Utils.escapeHtml(c)}</span>`).join('')}
          </div>
          <div class="hb-booking-tags">
            ${booking.clientEnvironments.slice(0, 3).map(c => `<span class="hb-tag hb-client-tag">${Utils.escapeHtml(c)}</span>`).join('')}
            ${booking.clientEnvironments.length > 3 ? `<span class="hb-tag hb-more-tag">+${booking.clientEnvironments.length - 3} more</span>` : ''}
          </div>
          <div class="hb-booking-meta">
            <span>${formatDate(booking.bookedAt)}</span>
            ${booking.bookedBy ? `<span>by ${Utils.escapeHtml(booking.bookedBy)}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Book a hotfix version
   */
  async function bookHotfix() {
    if (!nextVersion) {
      Utils.showToast('No version available to book.', 'warning');
      return;
    }

    if (selectedComponents.length === 0) {
      Utils.showToast('Please select at least one component.', 'warning');
      return;
    }

    if (selectedClients.length === 0) {
      Utils.showToast('Please select at least one client environment.', 'warning');
      return;
    }

    bookBtn.disabled = true;
    bookBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Booking...';

    try {
      const response = await fetch('/api/hotfix-booking/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: nextVersion,
          components: selectedComponents,
          clientEnvironments: selectedClients,
          bookedBy: 'Dashboard User' // Could be enhanced with actual user info
        })
      });

      const data = await response.json();

      if (data.error) {
        Utils.showToast(data.error, 'error');
        return;
      }

      // Success - reset selections and reload
      selectedComponents = [];
      selectedClients = [];
      renderComponentDropdown();
      renderClientDropdown();
      updateToggleText('component');
      updateToggleText('client');

      // Reload next version and bookings
      await loadNextVersion();
      await loadBookings();

      Utils.showToast(`Successfully booked version ${data.booking.version}!`, 'success');
    } catch (error) {
      console.error('Booking failed:', error);
      Utils.showToast('Failed to book hotfix version. Please try again.', 'error');
    } finally {
      bookBtn.disabled = false;
      bookBtn.innerHTML = '<span class="material-icons">book_online</span> Book Hotfix Version';
    }
  }

  /**
   * Load version matrix
   */
  async function loadVersionMatrix() {
    showMatrixLoading(true);

    try {
      const response = await fetch('/api/hotfix-booking/client-versions');
      const data = await response.json();

      if (data.error) {
        matrixTableEl.innerHTML = `<p class="hb-error">Error: ${Utils.escapeHtml(data.error)}</p>`;
        return;
      }

      renderVersionMatrix(data);
    } catch (error) {
      console.error('Failed to load version matrix:', error);
      matrixTableEl.innerHTML = '<p class="hb-error">Failed to load version matrix.</p>';
    } finally {
      showMatrixLoading(false);
    }
  }

  /**
   * Render version matrix table
   */
  function renderVersionMatrix(data) {
    if (!matrixTableEl) return;

    const { matrix, components, clients } = data;

    if (clients.length === 0 || components.length === 0) {
      matrixTableEl.innerHTML = '<p class="hb-no-data">No deployed versions found.</p>';
      return;
    }

    let html = `
      <table class="hb-matrix-table">
        <thead>
          <tr>
            <th class="hb-client-col">Client</th>
            ${components.map(c => `<th class="hb-comp-col">${Utils.escapeHtml(c)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    clients.forEach(client => {
      html += `<tr>
        <td class="hb-client-cell">${Utils.escapeHtml(client)}</td>`;
      
      components.forEach(comp => {
        const cellData = matrix[client]?.[comp];
        if (cellData) {
          html += `
            <td class="hb-version-cell" title="CM: ${cellData.cmKey}${cellData.deployedAt ? ', Deployed: ' + cellData.deployedAt : ''}">
              <span class="hb-version-value">${Utils.escapeHtml(cellData.version)}</span>
            </td>`;
        } else {
          html += `<td class="hb-version-cell hb-empty-cell">-</td>`;
        }
      });

      html += '</tr>';
    });

    html += '</tbody></table>';
    matrixTableEl.innerHTML = html;
  }

  /**
   * Show/hide loading indicator for book view
   */
  function showLoading(show) {
    if (loadingEl) {
      loadingEl.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Show/hide loading indicator for matrix view
   */
  function showMatrixLoading(show) {
    if (matrixLoadingEl) {
      matrixLoadingEl.style.display = show ? 'flex' : 'none';
    }
  }

  /**
   * Format date string
   */
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Refresh all data (called by Refresh Data button)
   */
  async function refresh() {
    showLoading(true);
    
    // Reset cached state to force reload
    fieldOptionsLoaded = false;
    
    try {
      // Reload field options, next version, and bookings in parallel
      await Promise.all([
        loadFieldOptions(),
        loadNextVersion(),
        loadBookings()
      ]);
      
      // If matrix view is visible, reload it too
      if (matrixView && matrixView.style.display !== 'none') {
        await loadVersionMatrix();
      }
      
      Utils.showToast('Data refreshed successfully', 'success');
    } catch (error) {
      console.error('Refresh failed:', error);
      Utils.showToast('Failed to refresh data', 'error');
    } finally {
      showLoading(false);
    }
  }

  // Export module
  window.HotfixBookingModule = {
    init,
    onTabShow,
    refresh
  };
})();
