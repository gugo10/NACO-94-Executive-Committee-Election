const APP_TITLE = 'NACO 94 Executive Committee Election';
const DEFAULT_ADMIN_PASSWORD = 'test-admin-password';

const SHEETS = {
  SETTINGS: 'Settings',
  VOTERS: 'Voters',
  OFFICES: 'Offices',
  CANDIDATES: 'Candidates',
  TOKENS: 'Tokens',
  VOTES: 'Votes',
  AUDIT: 'Audit',
  SNAPSHOTS: 'RegisterSnapshots'
};

const HEADERS = {
  Settings: ['key', 'value'],
  Voters: ['id', 'fullName', 'whatsappNumber', 'registeredAt', 'eligible', 'exclusionReason'],
  Offices: ['id', 'title', 'seatsAvailable', 'displayOrder'],
  Candidates: ['id', 'officeId', 'fullName', 'displayName', 'status'],
  Tokens: ['id', 'voterId', 'tokenHash', 'issuedAt', 'usedAt', 'revokedAt', 'codeSuffix'],
  Votes: ['id', 'officeId', 'candidateId', 'voterId', 'castAt'],
  Audit: ['id', 'actorType', 'actorId', 'eventType', 'metadata', 'createdAt'],
  RegisterSnapshots: ['id', 'snapshotAt', 'voterCount', 'votersJson']
};

function setupElectionStorage() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty('SPREADSHEET_ID');
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create(APP_TITLE + ' Data');
    props.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  }

  Object.keys(SHEETS).forEach(function (key) {
    const sheetName = SHEETS[key];
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    const headers = HEADERS[sheetName];
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (current.join('') === '') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });

  seedSetting('title', APP_TITLE);
  seedSetting('status', 'setup');
  seedSetting('opensAt', '');
  seedSetting('closesAt', '');
  seedSetting('timezone', Session.getScriptTimeZone());
  seedSetting('registerLockedAt', '');
  seedSetting('adminPassword', props.getProperty('ADMIN_PASSWORD') || DEFAULT_ADMIN_PASSWORD);

  logAudit('admin', 'setup', 'storage_setup', { spreadsheetId: spreadsheet.getId() });
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    adminPassword: getSetting('adminPassword') || DEFAULT_ADMIN_PASSWORD
  };
}

function doGet(e) {
  setupIfNeeded();
  const template = HtmlService.createTemplateFromFile('App');
  template.initialPage = (e && e.parameter && e.parameter.page) || 'vote';
  template.initialCode = (e && e.parameter && e.parameter.code) || '';
  template.appTitle = getSetting('title') || APP_TITLE;
  return template
    .evaluate()
    .setTitle(getSetting('title') || APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupIfNeeded() {
  if (!PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')) {
    setupElectionStorage();
  }
}

function getSpreadsheet() {
  setupIfNeeded();
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
}

function sheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function seedSetting(key, value) {
  if (getSetting(key) === '') setSetting(key, value);
}

function getSetting(key) {
  const rows = readRows(SHEETS.SETTINGS);
  const found = rows.find(function (row) { return row.key === key; });
  return found ? String(found.value || '') : '';
}

function setSetting(key, value) {
  const settings = sheet(SHEETS.SETTINGS);
  const values = settings.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === key) {
      settings.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  settings.appendRow([key, value]);
}

function readRows(sheetName) {
  const target = sheet(sheetName);
  const values = target.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter(function (row) {
    return row.some(function (cell) { return String(cell) !== ''; });
  }).map(function (row, index) {
    const record = { _row: index + 2 };
    headers.forEach(function (header, col) {
      record[header] = row[col];
    });
    return record;
  });
}

function appendRow(sheetName, record) {
  const headers = HEADERS[sheetName];
  sheet(sheetName).appendRow(headers.map(function (header) { return record[header] || ''; }));
}

function updateRow(sheetName, rowNumber, record) {
  const headers = HEADERS[sheetName];
  sheet(sheetName).getRange(rowNumber, 1, 1, headers.length).setValues([
    headers.map(function (header) { return record[header] || ''; })
  ]);
}

function makeId(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function makeCode() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function hashCode(code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(code || '').trim().toUpperCase());
  return bytes.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function nowIso() {
  return new Date().toISOString();
}

function requireAdmin(password) {
  if (String(password || '') !== String(getSetting('adminPassword') || DEFAULT_ADMIN_PASSWORD)) {
    logAudit('unknown', '', 'failed_admin_access', {});
    throw new Error('Incorrect admin password.');
  }
}

function getPublicConfig() {
  return {
    title: getSetting('title') || APP_TITLE,
    status: getSetting('status') || 'setup',
    opensAt: getSetting('opensAt') || '',
    closesAt: getSetting('closesAt') || '',
    registerLockedAt: getSetting('registerLockedAt') || ''
  };
}

function getResults() {
  const voters = readRows(SHEETS.VOTERS);
  const tokens = readRows(SHEETS.TOKENS);
  const offices = readRows(SHEETS.OFFICES).sort(function (a, b) {
    return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
  });
  const candidates = readRows(SHEETS.CANDIDATES);
  const votes = readRows(SHEETS.VOTES);
  const eligible = voters.filter(function (v) { return String(v.eligible) === 'TRUE' || v.eligible === true || String(v.eligible).toLowerCase() === 'true'; });
  const excluded = voters.length - eligible.length;
  const votedIds = {};
  tokens.forEach(function (token) {
    if (token.usedAt) votedIds[token.voterId] = true;
  });
  const votesCast = Object.keys(votedIds).length;

  return {
    election: getPublicConfig(),
    summary: {
      registered: voters.length,
      eligible: eligible.length,
      excluded: excluded,
      votesCast: votesCast,
      turnout: eligible.length ? Math.round((votesCast / eligible.length) * 100) : 0
    },
    offices: offices.map(function (office) {
      const officeCandidates = candidates.filter(function (candidate) {
        return candidate.officeId === office.id && String(candidate.status || 'active') !== 'inactive';
      });
      const totals = officeCandidates.map(function (candidate) {
        const count = votes.filter(function (vote) {
          return vote.officeId === office.id && vote.candidateId === candidate.id;
        }).length;
        return {
          candidateId: candidate.id,
          name: candidate.displayName || candidate.fullName,
          count: count
        };
      });
      return {
        officeId: office.id,
        title: office.title,
        total: totals.reduce(function (sum, item) { return sum + item.count; }, 0),
        candidates: totals
      };
    })
  };
}

function lookupCode(code) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const tokenHash = hashCode(cleanCode);
  const tokens = readRows(SHEETS.TOKENS);
  const token = tokens.find(function (item) {
    return item.tokenHash === tokenHash && !item.revokedAt;
  });
  if (!token) {
    logAudit('voter', '', 'invalid_code_lookup', { codeSuffix: cleanCode.slice(-4) });
    throw new Error('Invalid voting code. Please check the private code sent by ELECO.');
  }
  const voter = readRows(SHEETS.VOTERS).find(function (item) { return item.id === token.voterId; });
  if (!voter) throw new Error('This code is not linked to a registered voter.');
  const eligible = String(voter.eligible) === 'TRUE' || voter.eligible === true || String(voter.eligible).toLowerCase() === 'true';
  if (!eligible) throw new Error('This registered member is not eligible to vote.');
  if (token.usedAt) {
    return { alreadyVoted: true, voter: publicVoter(voter), election: getPublicConfig() };
  }
  const open = votingOpenMessage();
  if (open) throw new Error(open);

  const offices = readRows(SHEETS.OFFICES).sort(function (a, b) {
    return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
  });
  const candidates = readRows(SHEETS.CANDIDATES);
  return {
    alreadyVoted: false,
    voter: publicVoter(voter),
    election: getPublicConfig(),
    offices: offices.map(function (office) {
      return {
        id: office.id,
        title: office.title,
        candidates: candidates.filter(function (candidate) {
          return candidate.officeId === office.id && String(candidate.status || 'active') !== 'inactive';
        }).map(function (candidate) {
          return {
            id: candidate.id,
            name: candidate.displayName || candidate.fullName
          };
        })
      };
    }).filter(function (office) { return office.candidates.length > 0; })
  };
}

function publicVoter(voter) {
  return {
    id: voter.id,
    fullName: voter.fullName
  };
}

function votingOpenMessage() {
  const status = getSetting('status') || 'setup';
  if (status !== 'open') return 'Voting is currently ' + status + '.';
  const now = Date.now();
  const opensAt = getSetting('opensAt');
  const closesAt = getSetting('closesAt');
  if (opensAt && now < Date.parse(opensAt)) return 'Voting has not opened yet.';
  if (closesAt && now > Date.parse(closesAt)) return 'Voting has closed.';
  return '';
}

function submitVote(code, choices) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cleanCode = String(code || '').trim().toUpperCase();
    const tokenHash = hashCode(cleanCode);
    const tokens = readRows(SHEETS.TOKENS);
    const token = tokens.find(function (item) {
      return item.tokenHash === tokenHash && !item.revokedAt;
    });
    if (!token) throw new Error('Invalid voting code.');
    if (token.usedAt) {
      logAudit('voter', token.voterId, 'duplicate_vote_attempt', {});
      throw new Error('This code has already been used.');
    }

    const voter = readRows(SHEETS.VOTERS).find(function (item) { return item.id === token.voterId; });
    const eligible = voter && (String(voter.eligible) === 'TRUE' || voter.eligible === true || String(voter.eligible).toLowerCase() === 'true');
    if (!eligible) throw new Error('This member is not eligible to vote.');
    const openMessage = votingOpenMessage();
    if (openMessage) throw new Error(openMessage);

    const offices = readRows(SHEETS.OFFICES);
    const candidates = readRows(SHEETS.CANDIDATES);
    const castAt = nowIso();
    offices.forEach(function (office) {
      const candidateId = choices && choices[office.id];
      const valid = candidates.some(function (candidate) {
        return candidate.id === candidateId && candidate.officeId === office.id && String(candidate.status || 'active') !== 'inactive';
      });
      if (valid) {
        appendRow(SHEETS.VOTES, {
          id: makeId('vote'),
          officeId: office.id,
          candidateId: candidateId,
          voterId: voter.id,
          castAt: castAt
        });
      }
    });

    token.usedAt = castAt;
    updateRow(SHEETS.TOKENS, token._row, token);
    logAudit('voter', voter.id, 'vote_submitted', { officeCount: Object.keys(choices || {}).length });
    return { ok: true, voterName: voter.fullName, results: getResults() };
  } finally {
    lock.releaseLock();
  }
}

function getAdminState(password) {
  requireAdmin(password);
  return {
    election: getPublicConfig(),
    voters: readRows(SHEETS.VOTERS),
    offices: readRows(SHEETS.OFFICES),
    candidates: readRows(SHEETS.CANDIDATES),
    tokens: readRows(SHEETS.TOKENS).map(function (token) {
      return {
        id: token.id,
        voterId: token.voterId,
        issuedAt: token.issuedAt,
        usedAt: token.usedAt,
        revokedAt: token.revokedAt,
        codeSuffix: token.codeSuffix
      };
    }),
    results: getResults(),
    spreadsheetUrl: getSpreadsheet().getUrl()
  };
}

function saveElectionSettings(password, settings) {
  requireAdmin(password);
  setSetting('title', settings.title || APP_TITLE);
  setSetting('status', settings.status || 'setup');
  setSetting('opensAt', settings.opensAt || '');
  setSetting('closesAt', settings.closesAt || '');
  setSetting('timezone', settings.timezone || Session.getScriptTimeZone());
  if (settings.adminPassword) setSetting('adminPassword', settings.adminPassword);
  logAudit('admin', 'admin', 'election_settings_saved', { status: settings.status });
  return getAdminState(password);
}

function addVoter(password, voter) {
  requireAdmin(password);
  ensureRegisterUnlocked();
  appendRow(SHEETS.VOTERS, {
    id: makeId('voter'),
    fullName: String(voter.fullName || '').trim(),
    whatsappNumber: String(voter.whatsappNumber || '').trim(),
    registeredAt: nowIso(),
    eligible: voter.eligible === true || String(voter.eligible) === 'true',
    exclusionReason: String(voter.exclusionReason || '').trim()
  });
  logAudit('admin', 'admin', 'voter_added', { fullName: voter.fullName });
  return getAdminState(password);
}

function importVoters(password, text) {
  requireAdmin(password);
  ensureRegisterUnlocked();
  const lines = String(text || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  lines.forEach(function (line) {
    const parts = line.split(',');
    appendRow(SHEETS.VOTERS, {
      id: makeId('voter'),
      fullName: String(parts[0] || '').trim(),
      whatsappNumber: String(parts[1] || '').trim(),
      registeredAt: nowIso(),
      eligible: true,
      exclusionReason: ''
    });
  });
  logAudit('admin', 'admin', 'voters_imported', { count: lines.length });
  return getAdminState(password);
}

function updateVoter(password, voter) {
  requireAdmin(password);
  ensureRegisterUnlocked();
  const rows = readRows(SHEETS.VOTERS);
  const existing = rows.find(function (item) { return item.id === voter.id; });
  if (!existing) throw new Error('Voter not found.');
  existing.fullName = String(voter.fullName || '').trim();
  existing.whatsappNumber = String(voter.whatsappNumber || '').trim();
  existing.eligible = voter.eligible === true || String(voter.eligible) === 'true';
  existing.exclusionReason = String(voter.exclusionReason || '').trim();
  updateRow(SHEETS.VOTERS, existing._row, existing);
  logAudit('admin', 'admin', 'voter_updated', { voterId: voter.id });
  return getAdminState(password);
}

function addOffice(password, office) {
  requireAdmin(password);
  appendRow(SHEETS.OFFICES, {
    id: makeId('office'),
    title: String(office.title || '').trim(),
    seatsAvailable: Number(office.seatsAvailable || 1),
    displayOrder: Number(office.displayOrder || 1)
  });
  logAudit('admin', 'admin', 'office_added', { title: office.title });
  return getAdminState(password);
}

function addCandidate(password, candidate) {
  requireAdmin(password);
  appendRow(SHEETS.CANDIDATES, {
    id: makeId('candidate'),
    officeId: candidate.officeId,
    fullName: String(candidate.fullName || '').trim(),
    displayName: String(candidate.displayName || candidate.fullName || '').trim(),
    status: 'active'
  });
  logAudit('admin', 'admin', 'candidate_added', { fullName: candidate.fullName });
  return getAdminState(password);
}

function generateMissingCodes(password, webAppUrl) {
  requireAdmin(password);
  const voters = readRows(SHEETS.VOTERS);
  const tokens = readRows(SHEETS.TOKENS);
  const generated = [];
  voters.forEach(function (voter) {
    const eligible = String(voter.eligible) === 'TRUE' || voter.eligible === true || String(voter.eligible).toLowerCase() === 'true';
    const hasActive = tokens.some(function (token) {
      return token.voterId === voter.id && !token.revokedAt && !token.usedAt;
    });
    if (!eligible || hasActive) return;
    const code = makeCode();
    appendRow(SHEETS.TOKENS, {
      id: makeId('token'),
      voterId: voter.id,
      tokenHash: hashCode(code),
      issuedAt: nowIso(),
      usedAt: '',
      revokedAt: '',
      codeSuffix: code.slice(-4)
    });
    generated.push({
      voterName: voter.fullName,
      whatsappNumber: voter.whatsappNumber,
      code: code,
      link: String(webAppUrl || '').split('?')[0] + '?code=' + encodeURIComponent(code)
    });
  });
  logAudit('admin', 'admin', 'codes_generated', { count: generated.length });
  return generated;
}

function lockRegister(password) {
  requireAdmin(password);
  const voters = readRows(SHEETS.VOTERS);
  const lockedAt = nowIso();
  setSetting('registerLockedAt', lockedAt);
  appendRow(SHEETS.SNAPSHOTS, {
    id: makeId('snapshot'),
    snapshotAt: lockedAt,
    voterCount: voters.length,
    votersJson: JSON.stringify(voters)
  });
  logAudit('admin', 'admin', 'register_locked', { voterCount: voters.length });
  return getAdminState(password);
}

function ensureRegisterUnlocked() {
  if (getSetting('registerLockedAt')) {
    throw new Error('The voter register has been locked. Additions and edits are blocked.');
  }
}

function getConfidentialReport(password) {
  requireAdmin(password);
  const voters = readRows(SHEETS.VOTERS);
  const offices = readRows(SHEETS.OFFICES);
  const candidates = readRows(SHEETS.CANDIDATES);
  const tokens = readRows(SHEETS.TOKENS);
  const votes = readRows(SHEETS.VOTES);
  const votedIds = {};
  tokens.forEach(function (token) {
    if (token.usedAt) votedIds[token.voterId] = true;
  });
  const choices = {};
  votes.forEach(function (vote) {
    const voter = voters.find(function (item) { return item.id === vote.voterId; });
    const office = offices.find(function (item) { return item.id === vote.officeId; });
    const candidate = candidates.find(function (item) { return item.id === vote.candidateId; });
    if (!voter) return;
    if (!choices[voter.id]) {
      choices[voter.id] = {
        voterName: voter.fullName,
        whatsappNumber: voter.whatsappNumber,
        choices: []
      };
    }
    choices[voter.id].choices.push({
      office: office ? office.title : vote.officeId,
      candidate: candidate ? (candidate.displayName || candidate.fullName) : vote.candidateId,
      castAt: vote.castAt
    });
  });
  return {
    election: getPublicConfig(),
    results: getResults(),
    votersWhoVoted: voters.filter(function (voter) { return votedIds[voter.id]; }),
    eligibleVotersWhoDidNotVote: voters.filter(function (voter) {
      const eligible = String(voter.eligible) === 'TRUE' || voter.eligible === true || String(voter.eligible).toLowerCase() === 'true';
      return eligible && !votedIds[voter.id];
    }),
    excludedVoters: voters.filter(function (voter) {
      return !(String(voter.eligible) === 'TRUE' || voter.eligible === true || String(voter.eligible).toLowerCase() === 'true');
    }),
    confidentialChoices: Object.keys(choices).map(function (key) { return choices[key]; }),
    audit: readRows(SHEETS.AUDIT),
    snapshots: readRows(SHEETS.SNAPSHOTS)
  };
}

function logAudit(actorType, actorId, eventType, metadata) {
  appendRow(SHEETS.AUDIT, {
    id: makeId('audit'),
    actorType: actorType,
    actorId: actorId,
    eventType: eventType,
    metadata: JSON.stringify(metadata || {}),
    createdAt: nowIso()
  });
}
