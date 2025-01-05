export default function Navbar(props){
    const pages = props.pages
    return(
        <nav>
            <ul className="bg-gray-800 flex flex-row text-white">
                {
                    pages.map((page) => <li key={page.id} className="m-3"><a href={page.link}>{page.display}</a></li>)
                }
            </ul>
        </nav>
    )
}