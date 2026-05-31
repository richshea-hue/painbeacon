// Condition and procedure topics for the /[topic]/[city] pages. Each carries a
// real, human-written description so the page has genuine value (not auto-spun
// text) — required to survive Google's helpful-content bar on YMYL pages.
// Pain clinics treat these conditions / perform these procedures as core scope,
// so listing local pain clinics under each is accurate framing.

export const CONDITIONS = {
  sciatica: {
    label: 'Sciatica',
    blurb:
      'Sciatica is nerve pain radiating from the lower back down the leg, ' +
      'usually from compression or irritation of the sciatic nerve. Pain ' +
      'medicine clinics evaluate the source (disc, stenosis, piriformis) and ' +
      'treat it with a mix of medication, physical therapy, and targeted ' +
      'interventional procedures such as epidural steroid injections.',
  },
  neuropathy: {
    label: 'Neuropathy',
    blurb:
      'Peripheral neuropathy causes burning, tingling, or numbness, often in ' +
      'the hands and feet, from nerve damage with many possible causes. Pain ' +
      'specialists focus on diagnosis, medication management, and procedures ' +
      'like nerve blocks or spinal cord stimulation for refractory cases.',
  },
  'back-pain': {
    label: 'Back Pain',
    blurb:
      'Chronic back pain has many drivers — discs, facet joints, muscles, and ' +
      'nerves. Interventional pain clinics localize the pain generator and ' +
      'offer escalating options from conservative care to facet injections, ' +
      'radiofrequency ablation, and other image-guided procedures.',
  },
  'neck-pain': {
    label: 'Neck Pain',
    blurb:
      'Cervical (neck) pain can stem from discs, facet joints, or nerve roots. ' +
      'Pain medicine clinics use a stepwise approach, adding cervical ' +
      'injections or ablation when conservative measures are not enough.',
  },
  'failed-back-surgery': {
    label: 'Failed Back Surgery Syndrome',
    blurb:
      'Persistent pain after spine surgery (FBSS) is complex and benefits from ' +
      'dedicated pain management. Specialists assess the cause and consider ' +
      'advanced options such as spinal cord stimulation when appropriate.',
  },
  fibromyalgia: {
    label: 'Fibromyalgia',
    blurb:
      'Fibromyalgia causes widespread pain, fatigue, and sleep disruption. Pain ' +
      'clinics coordinate medication, behavioral, and rehabilitative strategies ' +
      'in a patient-specific plan.',
  },
};

export const PROCEDURES = {
  'epidural-steroid-injection': {
    label: 'Epidural Steroid Injection',
    blurb:
      'An epidural steroid injection delivers anti-inflammatory medication near ' +
      'irritated spinal nerves under image guidance, commonly used for sciatica ' +
      'and radicular back or neck pain.',
  },
  'nerve-block': {
    label: 'Nerve Block',
    blurb:
      'A nerve block injects medication around a specific nerve or group of ' +
      'nerves to interrupt pain signals, used both diagnostically and ' +
      'therapeutically.',
  },
  'spinal-cord-stimulator': {
    label: 'Spinal Cord Stimulator',
    blurb:
      'A spinal cord stimulator is an implanted device that masks pain signals ' +
      'with mild electrical pulses, considered for select chronic pain that has ' +
      'not responded to other treatments.',
  },
  'radiofrequency-ablation': {
    label: 'Radiofrequency Ablation',
    blurb:
      'Radiofrequency ablation uses heat to interrupt pain-carrying nerves, ' +
      'often for facet-joint-related back and neck pain, typically after a ' +
      'positive diagnostic block.',
  },
  'facet-joint-injection': {
    label: 'Facet Joint Injection',
    blurb:
      'Facet joint injections place medication in or around the small spinal ' +
      'joints to diagnose and relieve pain originating from those joints.',
  },
};

export const ALL_TOPICS = {
  ...Object.fromEntries(Object.entries(CONDITIONS).map(([k, v]) => [k, { ...v, kind: 'condition' }])),
  ...Object.fromEntries(Object.entries(PROCEDURES).map(([k, v]) => [k, { ...v, kind: 'procedure' }])),
};

// Only generate a topic×city page when the city has at least this many clinics,
// so we never ship thin pages (helpful-content compliance).
export const MIN_CLINICS_FOR_TOPIC_PAGE = 2;
