import { useEffect, useState } from 'react';

export function useHashRoute() {
  const get = () => window.location.hash.replace(/^#\/?/, '').split('/');
  const [parts, setParts] = useState(get);
  useEffect(() => {
    const on = () => setParts(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export function navigate(path) {
  window.location.hash = `#/${path}`;
}
