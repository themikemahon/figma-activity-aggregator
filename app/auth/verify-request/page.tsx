export default function VerifyRequest() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
          Check your email
        </h1>
        <p style={{ color: '#666', lineHeight: '1.5' }}>
          A sign in link has been sent to your email address. Click the link in the email to sign in.
        </p>
        <p style={{ marginTop: '1rem', color: '#999', fontSize: '0.875rem' }}>
          You can close this window.
        </p>
      </div>
    </div>
  );
}
