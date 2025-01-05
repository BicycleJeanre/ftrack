"use client"
import {useState, useEffect} from 'react'

export default function KeyValue(props){    
    const [data, setData] = useState(props.data); // Initialize state once with props

    // useEffect(() => {
    //     // If props.data changes, update state only if necessary
    //     setData(props.data);
    // }, [props.data]); // Only update if props.data changes

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

    function handleSubmit(event){
        event.preventDefault()

        props.submit(data)

    }

    function handleAddNew(event){
        event.preventDefault()
        const newId = data.reduce((aggr, item) => {
            return item.id > aggr ? item.id : aggr
        }, 0) + 1
        setData(prevData => [...prevData, {id: newId, keyName: "newKey", keyDescription: "New Key", valueDescription: "New Value"}])
    }

    console.log(JSON.stringify(data))

    const itemMarkup = data.map(item => {
        console.log(item)
        return(
            <li key={item.id} className="p-2">
                <label >
                    <input
                        className="m-1 rounded p-1 bg-transparent" 
                        type="text" 
                        defaultValue={item.keyDescription}
                        name={item.keyName}>
                    </input>
                    <input 
                        className="m-1 rounded p-1" 
                        type="text" 
                        defaultValue={item.valueDescription}
                        name={item.valueName}
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
                className="basic-button bg-green-500" 
                onClick={handleAddNew}
            >Add New</button>
            <button 
                className="float-right basic-button bg-blue-500" 
                onClick={handleSubmit}
            >Submit Changes!</button>
            
        </form>
    )
}