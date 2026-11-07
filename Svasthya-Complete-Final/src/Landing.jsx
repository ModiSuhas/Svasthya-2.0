const features = [
  {
    number: '01',
    symbol: '♙',
    title: 'Patient records',
    description: 'Keep registration details, clinic MRNs, and visit history together in one searchable record.',
  },
  {
    number: '02',
    symbol: '◷',
    title: 'Appointments & queue',
    description: 'Coordinate visits, follow queue status, and help the care team see what needs attention.',
  },
  {
    number: '03',
    symbol: '✚',
    title: 'Consultations & labs',
    description: 'Connect consultation notes and test requests with the patient and their care journey.',
  },
  {
    number: '04',
    symbol: '▣',
    title: 'Pharmacy & stock',
    description: 'Track medicine batches, expiry dates, low stock, and prescription dispensing.',
  },
];

const steps = [
  ['01', 'Register', 'Create a patient record and clinic MRN.'],
  ['02', 'Coordinate', 'Schedule the visit and manage the queue.'],
  ['03', 'Care', 'Record consultation notes and diagnostic requests.'],
  ['04', 'Follow through', 'Track results, prescriptions, and stock.'],
];

export default function Landing({ onSignIn }) {
  return <div className="public-site" id="home">
    <header className="public-header">
      <a className="public-brand" href="#home" aria-label="Svasthya home">
        <span className="brand-mark">S</span>
        <span><strong>Svasthya</strong><small>Health center workspace</small></span>
      </a>
      <nav className="public-nav" aria-label="Main navigation">
        <a href="#services">What it does</a>
        <a href="#workflow">Care pathway</a>
        <a href="#about">About the project</a>
        <a href="#location">Location</a>
      </nav>
      <button className="button primary public-signin" onClick={onSignIn}>Staff sign in <span aria-hidden="true">→</span></button>
    </header>

    <main>
      <section className="public-hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="live-dot" /> COMMUNITY HEALTH CENTER PLATFORM</div>
          <h1>Care works better<br />when it’s <em>connected.</em></h1>
          <p className="hero-description">Svasthya brings patient registration, appointments, consultations, diagnostics, and pharmacy workflows into one coordinated workspace.</p>
          <div className="hero-actions">
            <button className="button primary hero-primary" onClick={onSignIn}>Enter staff workspace <span aria-hidden="true">→</span></button>
            <a className="hero-secondary" href="#services">Explore the platform <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-assurances"><span><b>✓</b> Role-based workspaces</span><span><b>✓</b> Connected patient journey</span></div>
        </div>

        <div className="hero-art" role="img" aria-label="Illustrative preview of the Svasthya health-center dashboard">
          <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
          <div className="preview-card">
            <div className="preview-topbar"><span className="preview-logo">S</span><div><strong>SVASTHYA</strong><small>CARE WORKSPACE</small></div><span className="preview-dots">•••</span></div>
            <div className="preview-welcome"><div><small>MONDAY · SAMPLE VIEW</small><strong>Today at a glance</strong></div><span className="preview-status"><i /> Connected</span></div>
            <div className="preview-metrics">
              <div><span>Visits</span><strong>18</strong><small>In today’s queue</small></div>
              <div><span>Lab orders</span><strong>06</strong><small>Being processed</small></div>
              <div><span>Stock alerts</span><strong>02</strong><small>Need review</small></div>
            </div>
            <div className="preview-lower">
              <div className="preview-chart"><div className="preview-chart-head"><span>Care activity</span><small>THIS WEEK</small></div><div className="chart-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div><div className="chart-days"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div></div>
              <div className="preview-flow"><span className="preview-chart-title">Care pathway</span><p><i className="flow-check">✓</i><span><b>Registration</b><small>Patient record ready</small></span></p><p><i className="flow-current">2</i><span><b>Consultation</b><small>Visit in progress</small></span></p><p><i className="flow-next">3</i><span><b>Diagnostics</b><small>Next step</small></span></p></div>
            </div>
          </div>
          <div className="preview-caption"><span className="caption-dot" /> Illustrative interface preview · sample figures only</div>
        </div>
      </section>

      <section className="public-section services-section" id="services">
        <div className="section-heading"><div><p className="public-eyebrow">ONE WORKSPACE · MANY CONNECTED TASKS</p><h2>Organized around the<br />whole patient journey.</h2></div><p>Each team has a focused workspace, while authorized staff can follow the information needed for the next step in care.</p></div>
        <div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-card-top"><span className="feature-symbol">{feature.symbol}</span><span className="feature-number">{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.description}</p><span className="feature-accent" /></article>)}</div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="public-section workflow-inner">
          <div className="section-heading workflow-heading"><div><p className="public-eyebrow">A CLEARER HANDOFF</p><h2>From arrival to<br />next steps.</h2></div><p>Bring the everyday health-center workflow into one place, so records and responsibilities stay connected as a visit moves forward.</p></div>
          <div className="workflow-steps">{steps.map(([number, title, detail], index) => <article className="workflow-step" key={number}><div className="workflow-step-top"><span>{number}</span>{index < steps.length - 1 && <i aria-hidden="true" />}</div><h3>{title}</h3><p>{detail}</p></article>)}</div>
        </div>
      </section>

      <section className="public-section about-section" id="about">
        <div className="about-card"><div className="about-copy"><p className="public-eyebrow">BUILT FOR COORDINATED CARE</p><h2>Clear roles.<br />Connected records.</h2><p>Administrators, registration staff, doctors, laboratory staff, and pharmacy teams each get the tools relevant to their work, with access controlled by role.</p><button className="button light-button" onClick={onSignIn}>Staff sign in <span aria-hidden="true">→</span></button></div><div className="about-points"><div><span>01</span><p><strong>One patient record</strong><small>Follow appointments, consultations, laboratory requests, and prescriptions together.</small></p></div><div><span>02</span><p><strong>Purposeful access</strong><small>Give each staff role a clear workspace and appropriate permissions.</small></p></div><div><span>03</span><p><strong>Operational visibility</strong><small>Review queue status, stock alerts, reports, and staff activity.</small></p></div></div></div>
      </section>

      <section className="public-section location-section" id="location">
        <div className="location-heading"><div><p className="public-eyebrow">FIND THE HEALTH CENTER</p><h2>Our location.</h2></div><p>The map marks the Shantigram area in Ahmedabad.</p></div>
        <div className="location-card">
          <div className="location-details"><span className="location-symbol" aria-hidden="true">⌖</span><p className="location-label">AREA LOCATION</p><h3>Shantigram</h3><p className="location-address">Ahmedabad, Gujarat, India</p><a className="location-link" href="https://www.openstreetmap.org/?mlat=23.1613&mlon=72.5343#map=15/23.1613/72.5343" target="_blank" rel="noreferrer">Open in OpenStreetMap <span aria-hidden="true">↗</span></a><small className="location-note">Area-level marker · approximate neighborhood center</small></div>
          <div className="location-map"><iframe title="Map showing the Shantigram area in Ahmedabad" src="https://www.openstreetmap.org/export/embed.html?bbox=72.5143%2C23.1433%2C72.5543%2C23.1793&layer=mapnik&marker=23.1613%2C72.5343" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
        </div>
        <p className="map-attribution">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
      </section>
    </main>

    <footer className="public-footer"><a className="public-brand footer-brand" href="#home"><span className="brand-mark">S</span><span><strong>Svasthya</strong><small>Health center workspace</small></span></a><p>Academic project demonstration · Use synthetic data only.</p><button className="footer-signin" onClick={onSignIn}>Staff sign in <span aria-hidden="true">→</span></button></footer>
  </div>;
}
