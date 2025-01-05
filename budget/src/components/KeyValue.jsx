"use client"
import {useState, useEffect} from 'react'

export default function KeyValue(props){   

    const [data, setData] = useState(props.data.map(item => ({...item, isNew: false}))) // Initialize state once with props
    let enableSubmit = false
    if (props.submit) {
        enableSubmit = true
    }
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
        const {isNew, ...submissionData} = data //no, I don't undeerstand how this works... Smart AI
        props.submit(submissionData)

    }

    function handleAddNew(event){
        event.preventDefault()
        const newId = data.reduce((aggr, item) => {
            return item.id > aggr ? item.id : aggr
        }, 0) + 1
        setData(prevData => [...prevData, {id: newId, keyName: "newKey", keyDescription: "New Key", valueDescription: "New Value", isNew: true}])
    }

    console.log(JSON.stringify(data))

    const itemMarkup = data.map(item => {
        console.log(item)
        return(
            <li key={item.id} className={item.isNew ? "p-1 border-orange-600 border-2 rounded" :"p-1"}>
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
            {enableSubmit ? 
                <button 
                    className="float-right basic-button bg-blue-500" 
                    onClick={handleSubmit}
                >Submit Changes!</button>   
            :null}
            
            
        </form>
    )
}