import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', backgroundColor: '#1a202c', color: 'white' }}>
      <h1>ようこそ！</h1>
      <p><Link href="/login" style={{ color: '#9f7aea', textDecoration: 'underline' }}>ログインページへ</Link></p>
    </div>
  );
}