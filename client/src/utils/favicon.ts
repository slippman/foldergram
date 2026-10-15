const cinemaIcons: Record<string, string> = {
  '/favicon.svg': '/branding/ur-favicon-9a5af93327d1.svg',
  '/icon-32.png': '/branding/ur-favicon-9a5af93327d1-32.png',
  '/icon-16.png': '/branding/ur-favicon-9a5af93327d1-16.png'
};

export function setCinemaFavicon(cinema: boolean | null): void {
  if (cinema === null) return;
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    const original = link.dataset.classicHref ?? link.getAttribute('href') ?? '';
    if (!cinemaIcons[original]) return;
    link.dataset.classicHref = original;
    const href = cinema ? cinemaIcons[original] : original;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  });
}
