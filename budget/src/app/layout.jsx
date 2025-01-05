import "./globals.css";
import Navbar from './components/Navbar.jsx'

export default function RootLayout({ children }) {

    const pages = [{id: 1, display: "Home", link: "/"}, {id: 2, display: "Maintenance", link: "/Maintenance"}]

    return (
        <html lang="en">    
            <body>
                <Navbar pages={pages}/>
                {children}
            </body>
        </html>
    );
}
