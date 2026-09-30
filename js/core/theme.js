(function (global) {
  const KEY = 'themeId';
  const DEFAULT_ID = 'matcha';

  const THEMES = [
    {
      id: 'matcha', name: '抹茶',
      primary: '#5bab7c', primaryDeep: '#4a9a6a', primarySoft: '#e6f3eb',
      primaryGlow: 'rgba(91,171,124,.18)',
      bg: '#eef6ef', bgSoft: '#f4faf5', bgHover: '#e7f3ea',
      text: '#22332a', text2: '#5a6d61', text3: '#94a79a',
      line: '#dfece3', lineSoft: '#ecf4ef',
      gradient: 'linear-gradient(180deg, #e8f4ec 0%, #eef6ef 45%, #f4faf5 100%)',
      swatch: '#5bab7c'
    },
    {
      id: 'sky', name: '天空',
      primary: '#5a9bd4', primaryDeep: '#3f7fb8', primarySoft: '#e6f0fa',
      primaryGlow: 'rgba(90,155,212,.18)',
      bg: '#edf4fa', bgSoft: '#f4f8fc', bgHover: '#e6f0fa',
      text: '#1f3348', text2: '#566d80', text3: '#93a4b3',
      line: '#dbe7f0', lineSoft: '#eaf2f8',
      gradient: 'linear-gradient(180deg, #e6eff8 0%, #edf4fa 45%, #f4f8fc 100%)',
      swatch: '#5a9bd4'
    },
    {
      id: 'lilac', name: '藕荷',
      primary: '#9179b8', primaryDeep: '#785fa3', primarySoft: '#f0ebf8',
      primaryGlow: 'rgba(145,121,184,.18)',
      bg: '#f3eefa', bgSoft: '#f8f5fc', bgHover: '#f0ebf8',
      text: '#2c2140', text2: '#635578', text3: '#9d92ac',
      line: '#e6dff0', lineSoft: '#f0eaf7',
      gradient: 'linear-gradient(180deg, #ede6f8 0%, #f3eefa 45%, #f8f5fc 100%)',
      swatch: '#9179b8'
    },
    {
      id: 'sakura', name: '樱粉',
      primary: '#d486a3', primaryDeep: '#b96c89', primarySoft: '#fbeaf1',
      primaryGlow: 'rgba(212,134,163,.18)',
      bg: '#fdf0f4', bgSoft: '#fdf6f8', bgHover: '#fbeaf1',
      text: '#3d2330', text2: '#7c5c6b', text3: '#b399a5',
      line: '#f0d9e2', lineSoft: '#f8e8ee',
      gradient: 'linear-gradient(180deg, #fce9ef 0%, #fdf0f4 45%, #fdf6f8 100%)',
      swatch: '#d486a3'
    },
    {
      id: 'honey', name: '蜜杏',
      primary: '#d9904c', primaryDeep: '#b8762f', primarySoft: '#fcefdf',
      primaryGlow: 'rgba(217,144,76,.18)',
      bg: '#fdf4e9', bgSoft: '#fdf8f0', bgHover: '#fcefdf',
      text: '#3d2a13', text2: '#7a6042', text3: '#b39d83',
      line: '#f0e1ca', lineSoft: '#f8eedc',
      gradient: 'linear-gradient(180deg, #fbedd8 0%, #fdf4e9 45%, #fdf8f0 100%)',
      swatch: '#d9904c'
    },
    {
      id: 'bamboo', name: '青竹',
      primary: '#4fa89b', primaryDeep: '#3d8b7e', primarySoft: '#e3f3f1',
      primaryGlow: 'rgba(79,168,155,.18)',
      bg: '#ecf6f4', bgSoft: '#f4faf9', bgHover: '#e3f3f1',
      text: '#1f3833', text2: '#506d67', text3: '#93aca6',
      line: '#d8eae7', lineSoft: '#e8f3f1',
      gradient: 'linear-gradient(180deg, #e3f3f0 0%, #ecf6f4 45%, #f4faf9 100%)',
      swatch: '#4fa89b'
    },
    {
      id: 'oat', name: '燕麦',
      primary: '#a1896c', primaryDeep: '#856e52', primarySoft: '#f3ede4',
      primaryGlow: 'rgba(161,137,108,.18)',
      bg: '#f7f3ec', bgSoft: '#fbf8f3', bgHover: '#f3ede4',
      text: '#2f2820', text2: '#685c4d', text3: '#a39889',
      line: '#eae0d0', lineSoft: '#f3ebde',
      gradient: 'linear-gradient(180deg, #f0e9dc 0%, #f7f3ec 45%, #fbf8f3 100%)',
      swatch: '#a1896c'
    }
  ];

  function getById(id) {
    return THEMES.find(t => t.id === id) || THEMES[0];
  }

  function apply(theme) {
    const r = document.documentElement.style;
    r.setProperty('--primary',        theme.primary);
    r.setProperty('--primary-deep',   theme.primaryDeep);
    r.setProperty('--primary-soft',   theme.primarySoft);
    r.setProperty('--primary-glow',   theme.primaryGlow);
    r.setProperty('--bg',             theme.bg);
    r.setProperty('--bg-soft',        theme.bgSoft);
    r.setProperty('--bg-hover',       theme.bgHover);
    r.setProperty('--text',           theme.text);
    r.setProperty('--text-2',         theme.text2);
    r.setProperty('--text-3',         theme.text3);
    r.setProperty('--line',           theme.line);
    r.setProperty('--line-soft',      theme.lineSoft);
    r.setProperty('--bg-gradient',    theme.gradient);

    // 手机浏览器顶栏颜色
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.bg);
  }

  const Theme = {
    THEMES: THEMES,
    current() { return getById(Store.get(KEY) || DEFAULT_ID); },
    currentId() { return Store.get(KEY) || DEFAULT_ID; },
    init() { apply(Theme.current()); },
    set(id) {
      const t = getById(id);
      Store.set(KEY, t.id);
      apply(t);
    },
    all() { return THEMES.slice(); }
  };

  global.Theme = Theme;
})(window);