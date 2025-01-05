"use client"
import {useState} from 'react'

export default function KeyValue(props){
    const [data, setData] = useState(props.data) //[{},{}...]
    

    function handleRemove(event){
        event.preventDefault()
        const idToRemove = event.target.id

        setData(prevData => {
            return prevData.filter(item => {
                if (item.keyName != idToRemove){
                    return item
                }
            })
        })
    }

    function handleSubmit(){}

    function handleAddNew(){}

    console.log(JSON.stringify(data))

    const itemMarkup = data.map(item => {
        console.log(item)
        return(
            <li key={item.id} className="p-2">
                <label >
                    <span > 
                        {item.keyDescription}:
                    </span>
                    <input 
                        className="m-2 rounded p-1" 
                        type="text" 
                        defaultValue={item.value}
                        name={item.keyName}
                    ></input>
                    <button 
                        onClick={handleRemove}
                        className="basic-button bg-red-500"
                        id={item.keyName}
                    >Remove</button>
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
            <button 
                className="basic-button bg-blue-500" 
                onClick={handleSubmit}
            >Submit Changes!</button>
            <button 
                className="basic-button bg-green-500" 
                onClick={handleAddNew}
            >Add New</button>
        </form>
    )
}