export default function Header({ title, right }) {
  return (
    <div style={styles.header}>
      <div style={styles.left}>
        <img src="/riveron-wordmark.png" alt="Riveron" style={styles.wordmark} />
        {title && <span style={styles.title}>{title}</span>}
      </div>
      {right != null && <div style={styles.right}>{right}</div>}
    </div>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    height: '64px',
    backgroundColor: '#071739',
    borderBottom: '3px solid #dfa840',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
  },
  wordmark: {
    height: '22px',
    display: 'block',
    filter: 'brightness(0) invert(1)',
  },
  title: {
    color: '#6b7d94',
    fontSize: '13px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    marginLeft: '16px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
};
