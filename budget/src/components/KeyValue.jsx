export default function KeyValue(props){
    const data= props.data

    const itemMarkup = data.map(item => {
        return(
            <li key={item.id} className="p-2">
                <label >
                    <span > 
                        {item.keyDescription}:
                    </span>
                    <input 
                        className="m-2 rounded" 
                        type="text" 
                        defaultValue={item.value}
                        name="item.keyName"
                    ></input>
                </label>
            </li>
        )
    })
    return(
        <form className="text-white">
            {props.headline ? <h1>{props.headline}</h1>:null}
            <ul>
                {itemMarkup}
            </ul>   
        </form>
    )
}