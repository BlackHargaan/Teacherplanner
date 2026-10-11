// Points every download button at the matching installer in the newest
// GitHub release, and makes the big button download the right one for the
// visitor's computer. If GitHub can't be reached, buttons fall back to the
// release page.
(function () {
  const REPO = 'BlackHargaan/Teacherplanner';
  const PATTERNS = {
    win: /win.*\.exe$/i,
    mac: /\.dmg$/i,
    appimage: /\.AppImage$/i,
    deb: /\.deb$/i,
  };
  const NAMES = { win: 'Windows', mac: 'Mac', linux: 'Linux' };

  function detectOS() {
    const ua = navigator.userAgent;
    const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1)) return 'mobile';
    if (/CrOS/.test(ua)) return 'chromeos';
    if (/Win/i.test(platform) || /Windows/.test(ua)) return 'win';
    if (/Mac/i.test(platform) || /Macintosh/.test(ua)) return 'mac';
    if (/Linux/i.test(platform) || /Linux/.test(ua)) return 'linux';
    return 'unknown';
  }

  const os = detectOS();
  const hero = document.querySelector('[data-download="auto"]');
  const heroSub = hero.querySelector('[data-version]');
  const heroLabel = hero.querySelector('.btn-label');

  // Order the platform cards so the visitor's computer comes first.
  const current = document.querySelector(`.platform[data-platform="${os}"]`);
  if (current) {
    current.classList.add('current');
    current.parentElement.prepend(current);
  }
  if (os === 'mobile' || os === 'chromeos') {
    document.querySelector('[data-unsupported]').hidden = false;
  }

  function setHero(href, label) {
    hero.href = href;
    heroLabel.textContent = label;
  }

  const key = os === 'linux' ? 'appimage' : os;
  if (NAMES[os]) heroLabel.textContent = `Download for ${NAMES[os]}`;
  else hero.href = '#download';

  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((release) => {
      const version = release.tag_name.replace(/^v/, '');
      const date = new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      const urls = {};
      for (const [k, re] of Object.entries(PATTERNS)) {
        const asset = release.assets.find((a) => re.test(a.name));
        if (asset) urls[k] = asset.browser_download_url;
      }
      document.querySelectorAll('[data-download]').forEach((a) => {
        const url = urls[a.dataset.download];
        if (url) a.href = url;
      });
      if (urls[key]) {
        setHero(urls[key], `Download for ${NAMES[os]}`);
        heroSub.textContent = `Version ${version}`;
      } else {
        heroSub.textContent = `Version ${version} · Windows, Mac and Linux`;
      }
      document.querySelector('[data-version-line]').textContent = `Version ${version} · released ${date}`;
      document.querySelector('[data-version-footer]').textContent = `Version ${version}`;
    })
    .catch(() => {
      /* keep the fallback links to the release page */
    });
})();
