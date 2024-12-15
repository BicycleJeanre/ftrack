import Link from 'next/link';
import React from 'react';

const Navbar: React.FC = () => {
    return (
        <nav style={{ padding: '10px', background: '#808080' }}>
            <ul style={{ listStyleType: 'none', display: 'flex', gap: '15px' }}>
                <li><Link href="/">Home</Link></li>
                <li><Link href="/maintenance">Maintenance</Link></li>
            </ul>
        </nav>
    );
};

export default Navbar;
