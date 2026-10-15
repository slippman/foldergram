export function createDocumentTitleUpdater(): (cinema: boolean | null, albumName?: string) => void {
  // Only server-applied Cinema branding should be removed from the Classic fallback.
  const classicTitle = document.documentElement.dataset.cinemaEntry === 'true' ? 'Foldergram' : document.title;
  return (cinema, albumName) => {
    if (cinema === null) return;
    document.title = cinema
      ? albumName ? `${albumName} | UnReeled Photos` : 'UnReeled Photos'
      : classicTitle;
  };
}
