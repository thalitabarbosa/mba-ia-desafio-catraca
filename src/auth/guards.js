function loginRedirect(req, res) {
  const next = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(302, `/login${next}`);
}

function forbidden(res) {
  return res.status(403).render('error', { title: 'Acesso restrito', message: 'Acesso restrito.' });
}

export function requireOrganizer(req, res, next) {
  if (!req.user) return loginRedirect(req, res);
  if (req.user.role !== 'organizer') return forbidden(res);
  next();
}

export function requireParticipant(req, res, next) {
  if (!req.user) return loginRedirect(req, res);
  if (req.user.role !== 'participant') return forbidden(res);
  next();
}
