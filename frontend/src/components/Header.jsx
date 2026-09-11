export default function Header({ title, right }) {
  return (
    <div style={styles.header}>
      <div style={styles.left}>
        <span style={styles.wordmark}>Riveron</span>
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
    height: '52px',
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
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
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '15px',
    letterSpacing: '-0.3px',
  },
  title: {
    color: '#94a3b8',
    fontSize: '13px',
    marginLeft: '16px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
};
