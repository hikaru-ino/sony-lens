const DATA_FILES = {
  kpi: 'kpi.json',
  metadata: 'metadata.json',
  segments: 'segments.json',
  stock: 'stock.json'
};

const DONUT_RADIUS = 80;
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS;

let SONY_DATA = null;
let selectedMetric = 'revenue';
let selectedSegmentCode = 'G&NS';

const METRIC_CONFIG = {
  revenue: {
    centerLabel: 'Revenue',
    summary: '売上構成では G&NS が最大です。Music と I&SS は規模では中位ながら、成長率と収益性で存在感があります。',
    value: seg => seg.revenue,
    weight: seg => seg.revenue,
    format: value => formatRevenue(value)
  },
  operatingIncome: {
    centerLabel: 'Op. Income',
    summary: '営業利益では G&NS、Music、I&SS の貢献が大きく、エンタメ IP とセンサー技術が利益面で効いています。',
    value: seg => seg.operatingIncome,
    weight: seg => Math.max(seg.operatingIncome, 0),
    format: value => `¥${value.toFixed(1)}B`
  },
  margin: {
    centerLabel: 'Margin Rank',
    summary: '利益率では Music と I&SS が強く、ハードウェア中心の領域よりも IP・半導体の収益性が目立ちます。',
    value: seg => seg.margin,
    weight: seg => Math.max(seg.margin, 0),
    format: value => `${value.toFixed(1)}%`
  },
  share: {
    centerLabel: 'Share',
    summary: '売上シェアはグループの事業ポートフォリオを見る入口です。シェアと利益率を切り替えると、規模と質の差が見えます。',
    value: seg => seg.share,
    weight: seg => seg.share,
    format: value => `${value.toFixed(1)}%`
  }
};

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
}

async function loadSonyData() {
  const [kpiData, metadataData, segmentsData, stockData] = await Promise.all([
    loadJson(DATA_FILES.kpi),
    loadJson(DATA_FILES.metadata),
    loadJson(DATA_FILES.segments),
    loadJson(DATA_FILES.stock)
  ]);

  return {
    metadata: normalizeMetadata(metadataData, kpiData),
    kpi: normalizeKpi(kpiData),
    segments: normalizeSegments(segmentsData),
    stockSeries: stockData.series,
    stockMeta: stockData
  };
}

function normalizeMetadata(metadataData, kpiData) {
  return {
    fiscal_year_label: kpiData.fiscal_year_label,
    period_label: kpiData.period_label,
    ticker: metadataData.data.ticker,
    last_updated: metadataData.data.last_updated,
    data_source: metadataData.sources.map(source => source.name).join(' / '),
    sources: metadataData.sources.map(source => ({
      name: source.name,
      url: source.url
    }))
  };
}

function normalizeKpi(kpiData) {
  const entries = [
    ['revenue', 'Revenue / FY24'],
    ['operating_income', 'Operating Income'],
    ['stock_price', 'Stock Price (TYO)'],
    ['market_cap', 'Market Cap']
  ];

  return entries.map(([key, fallbackLabel]) => {
    const item = kpiData.kpi[key];
    const decimals = item.unit === 'T' ? 2 : 0;
    const delta = typeof item.yoy_change_pct === 'number'
      ? `${item.yoy_change_pct > 0 ? '▲ +' : '▼ '}${Math.abs(item.yoy_change_pct).toFixed(1)}% YoY`
      : item.is_placeholder ? '— Reference value' : '—';
    const deltaClass = typeof item.yoy_change_pct === 'number'
      ? item.yoy_change_pct >= 0 ? 'up' : 'down'
      : 'flat';

    return {
      key,
      label: item.label || fallbackLabel,
      target: item.value,
      decimals,
      unit: item.unit,
      delta,
      deltaClass
    };
  });
}

function normalizeSegments(segmentsData) {
  return segmentsData.segments.map((seg, index) => ({
    code: seg.code,
    name: seg.name_ja,
    revenue: seg.revenue_trillion,
    share: seg.revenue_share_pct,
    yoy: seg.yoy_change_pct,
    operatingIncome: seg.operating_income_billion,
    margin: seg.operating_margin_pct,
    color: seg.color,
    glow: index < 2,
    driver: seg.driver_ja,
    insight: seg.insight_ja,
    note: seg.note
  }));
}

function formatRevenue(value) {
  return value >= 0.1 ? `¥${value.toFixed(2)}T` : `¥${(value * 1000).toFixed(0)}B`;
}

function formatSignedPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function getSegmentLeaders() {
  const sortedByRevenue = [...SONY_DATA.segments].sort((a, b) => b.revenue - a.revenue);
  const sortedByIncome = [...SONY_DATA.segments].sort((a, b) => b.operatingIncome - a.operatingIncome);
  const sortedByMargin = [...SONY_DATA.segments].sort((a, b) => b.margin - a.margin);
  const sortedByGrowth = [...SONY_DATA.segments].sort((a, b) => b.yoy - a.yoy);
  return {
    revenue: sortedByRevenue[0],
    income: sortedByIncome[0],
    margin: sortedByMargin[0],
    growth: sortedByGrowth[0]
  };
}

function renderKPICards() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  grid.innerHTML = SONY_DATA.kpi.map(item => {
    const initial = item.decimals > 0 ? '0.0' : '0';
    return `
      <div class="kpi-card scroll-reveal">
        <div class="kpi-label">${item.label}</div>
        <div class="kpi-value">¥<span class="countup" data-target="${item.target}" data-decimals="${item.decimals}">${initial}</span><span class="unit">${item.unit}</span></div>
        <div class="kpi-delta ${item.deltaClass}">${item.delta}</div>
      </div>
    `;
  }).join('');
}

function renderExecutiveInsights() {
  const strip = document.getElementById('insight-strip');
  if (!strip) return;
  const leaders = getSegmentLeaders();
  const totalRevenue = SONY_DATA.kpi.find(k => k.key === 'revenue')?.target || 0;
  const totalIncome = SONY_DATA.kpi.find(k => k.key === 'operating_income')?.target || 0;
  const incomeShare = totalIncome > 0 ? (leaders.income.operatingIncome / (totalIncome * 1000)) * 100 : 0;
  const insights = [
    {
      label: 'Largest Revenue',
      value: leaders.revenue.code,
      copy: `${formatRevenue(leaders.revenue.revenue)} / group revenue ${((leaders.revenue.revenue / totalRevenue) * 100).toFixed(1)}%`,
      color: leaders.revenue.color
    },
    {
      label: 'Top Profit',
      value: leaders.income.code,
      copy: `Operating income ¥${leaders.income.operatingIncome.toFixed(1)}B / ${incomeShare.toFixed(1)}% of total OI`,
      color: leaders.income.color
    },
    {
      label: 'Best Margin',
      value: leaders.margin.code,
      copy: `${leaders.margin.margin.toFixed(1)}% margin. Asset-light IP and technology businesses stand out.`,
      color: leaders.margin.color
    },
    {
      label: 'Fastest Growth',
      value: leaders.growth.code,
      copy: `${formatSignedPercent(leaders.growth.yoy)} YoY. Growth quality should be read with margin and scale.`,
      color: leaders.growth.color
    }
  ];

  strip.innerHTML = insights.map(item => `
    <div class="insight-item" style="--insight-color: ${item.color};">
      <div class="insight-label">${item.label}</div>
      <div class="insight-value">${item.value}</div>
      <div class="insight-copy">${item.copy}</div>
    </div>
  `).join('');
}

function renderDonut() {
  const svg = document.getElementById('donut-svg');
  if (!svg) return;
  const donutWrap = document.getElementById('donut-wrap');
  const revealed = donutWrap?.dataset.revealed === 'true';
  let cumulative = 0;
  const metric = METRIC_CONFIG[selectedMetric];
  const totalWeight = SONY_DATA.segments.reduce((sum, seg) => sum + metric.weight(seg), 0);
  const circles = SONY_DATA.segments.map(seg => {
    const weight = metric.weight(seg);
    const len = totalWeight > 0 ? (weight / totalWeight) * DONUT_CIRC : 0;
    const offset = -cumulative;
    cumulative += len;
    return `<circle class="donut-segment"
              cx="100" cy="100" r="${DONUT_RADIUS}"
              stroke="${seg.color}"
              data-code="${seg.code}"
              data-len="${len.toFixed(2)}"
              data-offset="${offset.toFixed(2)}"
              style="stroke-dasharray: ${revealed ? len.toFixed(2) : '0'} ${DONUT_CIRC.toFixed(2)}; stroke-dashoffset: ${revealed ? offset.toFixed(2) : '0'}; opacity: ${seg.code === selectedSegmentCode ? '1' : '0.72'};"/>`;
  }).join('');
  svg.innerHTML = circles;

  const selected = SONY_DATA.segments.find(seg => seg.code === selectedSegmentCode) || SONY_DATA.segments[0];
  document.querySelector('.donut-center-label').textContent = metric.centerLabel;
  document.getElementById('donut-center-value').textContent = metric.format(metric.value(selected));
  document.getElementById('donut-center-unit').textContent = selected.code;
}

function renderSegmentList() {
  const list = document.getElementById('segment-list');
  if (!list) return;
  const metric = METRIC_CONFIG[selectedMetric];
  const revealed = list.dataset.revealed === 'true';
  const maxMetric = Math.max(...SONY_DATA.segments.map(seg => metric.weight(seg)));
  list.innerHTML = SONY_DATA.segments.map(seg => {
    const glowStyle = seg.glow
      ? `background: ${seg.color}; box-shadow: 0 0 8px ${seg.color};`
      : `background: ${seg.color};`;
    const metricValue = metric.format(metric.value(seg));
    const subValue = selectedMetric === 'margin'
      ? `OI ${seg.operatingIncome.toFixed(1)}B`
      : `YoY ${formatSignedPercent(seg.yoy)}`;
    const barWidth = maxMetric > 0 ? (metric.weight(seg) / maxMetric) * 100 : 0;
    return `
      <button class="segment-item ${revealed ? 'visible' : ''} ${seg.code === selectedSegmentCode ? 'active' : ''}" type="button" data-code="${seg.code}" style="--segment-color: ${seg.color}; --bar-width: ${barWidth.toFixed(1)}%;" aria-pressed="${seg.code === selectedSegmentCode}">
        <div class="segment-marker" style="${glowStyle}"></div>
        <div class="segment-info">
          <div class="segment-code">${seg.code}</div>
          <div class="segment-name">${seg.name}</div>
        </div>
        <div class="segment-value">
          <div class="num">${metricValue}</div>
          <div class="pct">${subValue}</div>
        </div>
        <span class="segment-bar" aria-hidden="true"><span class="segment-bar-fill"></span></span>
      </button>
    `;
  }).join('');
}

function renderSegmentDetail() {
  const detail = document.getElementById('segment-detail');
  const seg = SONY_DATA.segments.find(item => item.code === selectedSegmentCode) || SONY_DATA.segments[0];
  if (!detail || !seg) return;

  detail.style.setProperty('--segment-color', seg.color);
  detail.innerHTML = `
    <div>
      <div class="segment-detail-kicker">${seg.code} · Selected Segment</div>
      <h3 class="segment-detail-title">${seg.name}</h3>
      <p class="segment-detail-copy">${seg.driver}</p>
      <p class="segment-detail-copy" style="margin-top: 12px;">${seg.insight}</p>
      ${seg.note ? `<div class="segment-note">Note: ${seg.note}</div>` : ''}
    </div>
    <div class="segment-detail-metrics">
      <div class="segment-detail-metric">
        <div class="label">Revenue</div>
        <div class="value">${formatRevenue(seg.revenue)}</div>
      </div>
      <div class="segment-detail-metric">
        <div class="label">Share</div>
        <div class="value">${seg.share.toFixed(1)}%</div>
      </div>
      <div class="segment-detail-metric">
        <div class="label">Operating Income</div>
        <div class="value">¥${seg.operatingIncome.toFixed(1)}B</div>
      </div>
      <div class="segment-detail-metric">
        <div class="label">Margin / YoY</div>
        <div class="value">${seg.margin.toFixed(1)}% · ${formatSignedPercent(seg.yoy)}</div>
      </div>
    </div>
  `;
}

function renderSegments() {
  renderDonut();
  renderSegmentList();
  renderSegmentDetail();
  const summary = document.getElementById('segment-summary');
  if (summary) summary.textContent = METRIC_CONFIG[selectedMetric].summary;
}

function renderStockAndFooter() {
  const stockPrice = SONY_DATA.kpi.find(k => k.key === 'stock_price');
  if (stockPrice) {
    document.getElementById('stock-price').textContent = `¥${stockPrice.target.toLocaleString()}`;
    document.getElementById('stock-delta').textContent = '※ 参考値 · 株価は静的データ(API連携は今後実装予定)';
  }
  document.getElementById('footer-data-source').textContent = `Data: ${SONY_DATA.metadata.data_source}`;
  document.getElementById('footer-meta').textContent =
    `Fiscal Year: ${SONY_DATA.metadata.period_label} · Last updated: ${SONY_DATA.metadata.last_updated} · Ticker: ${SONY_DATA.metadata.ticker}`;
  const sources = document.getElementById('footer-sources');
  if (sources) {
    sources.innerHTML = SONY_DATA.metadata.sources.map(source =>
      `<a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a>`
    ).join('');
  }
}

function renderStockChart(period = '1Y') {
  const series = SONY_DATA.stockSeries[period] || SONY_DATA.stockSeries['1Y'];
  const values = series.values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 800 : (index / (values.length - 1)) * 800;
    const y = 220 - ((value - min) / span) * 165;
    return { x, y };
  });
  const lineD = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)},${point.y.toFixed(1)}`
  ).join(' ');
  const areaD = `${lineD} L 800,280 L 0,280 Z`;

  document.getElementById('chart-line').setAttribute('d', lineD);
  document.getElementById('chart-area').setAttribute('d', areaD);
  const last = points[points.length - 1];
  const lastPoint = document.getElementById('chart-last-point');
  lastPoint.setAttribute('cx', last.x.toFixed(1));
  lastPoint.setAttribute('cy', last.y.toFixed(1));

  series.labels.forEach((label, index) => {
    const labelEl = document.getElementById(`chart-label-${index}`);
    if (!labelEl) return;
    labelEl.textContent = label;
    labelEl.setAttribute('x', index === series.labels.length - 1 ? '770' : String(index * 200));
  });

  document.getElementById('stock-price').textContent = `¥${series.price.toLocaleString()}`;
  document.getElementById('stock-delta').textContent = `▲ ${series.delta} · ${period} reference`;
  const range = document.getElementById('chart-range');
  if (range) {
    range.innerHTML = `<span>Range: ¥${min.toLocaleString()} - ¥${max.toLocaleString()}</span><span>${period} static reference sample</span>`;
  }
  document.querySelectorAll('.period-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.period === period);
    tab.setAttribute('aria-pressed', String(tab.dataset.period === period));
  });
}

function setupInteractions() {
  const menuBtn = document.getElementById('menu-btn');
  const nav = document.getElementById('nav');
  menuBtn?.addEventListener('click', () => {
    const isOpen = nav?.classList.toggle('open') || false;
    menuBtn.setAttribute('aria-expanded', String(isOpen));
  });
  nav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuBtn?.setAttribute('aria-expanded', 'false');
    });
  });

  document.querySelectorAll('.metric-tab').forEach(tab => {
    tab.setAttribute('aria-pressed', String(tab.dataset.metric === selectedMetric));
    tab.addEventListener('click', () => {
      selectedMetric = tab.dataset.metric;
      document.querySelectorAll('.metric-tab').forEach(item => {
        item.classList.toggle('active', item.dataset.metric === selectedMetric);
        item.setAttribute('aria-pressed', String(item.dataset.metric === selectedMetric));
      });
      renderSegments();
    });
  });

  document.getElementById('segment-list')?.addEventListener('click', event => {
    const item = event.target.closest('.segment-item');
    if (!item) return;
    selectedSegmentCode = item.dataset.code;
    renderSegments();
  });

  document.getElementById('donut-svg')?.addEventListener('click', event => {
    const item = event.target.closest('.donut-segment');
    if (!item) return;
    selectedSegmentCode = item.dataset.code;
    renderSegments();
  });

  document.querySelectorAll('.period-tab').forEach(tab => {
    tab.addEventListener('click', () => renderStockChart(tab.dataset.period));
  });
}

function startLoader() {
  const loader = document.getElementById('loader');
  const loaderNum = document.getElementById('loader-num');
  const loaderFill = document.getElementById('loader-fill');
  const loaderMarker = document.getElementById('loader-marker');
  const loaderLog = document.getElementById('loader-log');
  const header = document.getElementById('header');
  const logScript = [
    { at: 5, text: 'Establishing secure channel ...', type: 'info' },
    { at: 15, text: 'Connecting to Sony IR / 6758.T', type: 'info' },
    { at: 28, text: 'Channel established · OK', type: 'ok' },
    { at: 38, text: 'Fetching local JSON data...', type: 'info' },
    { at: 55, text: 'Loading KPI / segments / stock', type: 'info' },
    { at: 68, text: 'JSON data loaded · OK', type: 'ok' },
    { at: 78, text: 'Calibrating the lens ...', type: 'info' },
    { at: 92, text: 'Visual systems online · OK', type: 'ok' },
    { at: 99, text: 'Ready. Welcome to SONY LENS.', type: 'ok' }
  ];
  let shownLogs = 0;

  function addLogLine(line) {
    const el = document.createElement('div');
    el.className = 'loader-log-line';
    const now = new Date();
    const ts = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
    el.innerHTML = `<span class="ts">${ts}</span><span class="${line.type}">› ${line.text}</span>`;
    loaderLog.appendChild(el);
    requestAnimationFrame(() => el.classList.add('shown'));
    while (loaderLog.children.length > 6) loaderLog.removeChild(loaderLog.children[0]);
  }

  let progress = 0;
  const loadInterval = setInterval(() => {
    progress += Math.random() * 3 + 1.2;
    if (progress >= 100) {
      progress = 100;
      clearInterval(loadInterval);
      setTimeout(() => {
        loader.classList.add('done');
        document.body.classList.add('ready');
        header.classList.add('ready');
      }, 600);
    }
    const intProgress = Math.floor(progress);
    loaderNum.textContent = intProgress;
    loaderFill.style.width = `${progress}%`;
    loaderMarker.style.left = `${progress}%`;
    while (shownLogs < logScript.length && intProgress >= logScript[shownLogs].at) {
      addLogLine(logScript[shownLogs]);
      shownLogs++;
    }
  }, 90);
}

function animateCount(el) {
  const target = parseFloat(el.dataset.target);
  const decimals = parseInt(el.dataset.decimals, 10);
  const duration = 1600;
  const startTime = performance.now();

  function tick(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = target * eased;
    el.textContent = decimals > 0 ? val.toFixed(decimals) : Math.floor(val).toLocaleString();
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = decimals > 0 ? target.toFixed(decimals) : target.toLocaleString();
  }
  requestAnimationFrame(tick);
}

function setupObservers() {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.scroll-reveal').forEach(el => revealObserver.observe(el));

  const kpiObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.countup').forEach(el => animateCount(el));
        kpiObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.highlights').forEach(el => kpiObserver.observe(el));

  const donutObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.dataset.revealed = 'true';
        entry.target.querySelectorAll('.donut-segment').forEach((seg, i) => {
          const len = seg.dataset.len;
          const offset = seg.dataset.offset;
          setTimeout(() => {
            seg.style.strokeDasharray = `${len} ${DONUT_CIRC.toFixed(2)}`;
            seg.style.strokeDashoffset = offset;
          }, i * 120);
        });
        donutObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const donutWrap = document.getElementById('donut-wrap');
  if (donutWrap) donutObserver.observe(donutWrap);

  const segmentObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.dataset.revealed = 'true';
        entry.target.querySelectorAll('.segment-item').forEach((item, i) => {
          setTimeout(() => item.classList.add('visible'), i * 80);
        });
        segmentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  document.querySelectorAll('.segment-list').forEach(el => segmentObserver.observe(el));

  const chartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        document.getElementById('chart-line').classList.add('visible');
        document.getElementById('chart-area').classList.add('visible');
        chartObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const chartContainer = document.getElementById('chart-container');
  if (chartContainer) chartObserver.observe(chartContainer);
}

function renderDataError(error) {
  console.error(error);
  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi-card scroll-reveal visible">
      <div class="kpi-label">Data Load Error</div>
      <div class="kpi-delta down">JSON を読み込めませんでした。ローカルサーバー経由で開いてください。</div>
    </div>
  `;
}

async function init() {
  startLoader();
  try {
    SONY_DATA = await loadSonyData();
    renderKPICards();
    renderExecutiveInsights();
    renderSegments();
    renderStockAndFooter();
    renderStockChart('1Y');
    setupInteractions();
    setupObservers();
  } catch (error) {
    renderDataError(error);
    setupInteractions();
    setupObservers();
  }
}

init();
