export default function AboutPage() {
  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">About us</h1>
        <p className="tagline">Daily To-Do List — habits, focus, one day at a time</p>
      </header>

      <section className="panel about-panel">
        <p>
          Daily To-Do List helps you plan by day: tasks, tags, habits, streaks, and goals in one place. Use
          the daily view for today, the week view for the bigger picture, and reports to see how you are doing
          over time.
        </p>
        <p>
          Your lists sync when you sign in so you can pick up where you left off. Theme and completion
          feedback live in Settings so you can tune the experience to how you like to work.
        </p>
        <p className="muted about-footnote">
          This page is linked from the site footer only — use the main navigation for Daily, Week, Report, and
          Settings when you are signed in.
        </p>
      </section>
    </>
  );
}
