'use strict';

/**
 * Idade em anos completos a partir de data_aquisicao (YYYY-MM-DD).
 * Sem meses — apenas anos corridos ou "Menos de 1 ano".
 */
function idadeAquisicaoDeISO(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return '';

  const inicio = new Date(y, mo - 1, d);
  const hoje = new Date();
  inicio.setHours(0, 0, 0, 0);
  hoje.setHours(0, 0, 0, 0);
  if (inicio > hoje) return 'Data futura';

  let anos = hoje.getFullYear() - inicio.getFullYear();
  const md = hoje.getMonth() - inicio.getMonth();
  const dd = hoje.getDate() - inicio.getDate();
  if (md < 0 || (md === 0 && dd < 0)) anos--;

  if (anos < 0) return '';
  if (anos === 0) return 'Menos de 1 ano';
  if (anos === 1) return '1 ano';
  return `${anos} anos`;
}

module.exports = { idadeAquisicaoDeISO };
