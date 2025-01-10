"use client"
import {useState, useEffect} from 'react'

export default function KeyValue(props){  
    let enableSubmit = props.submit ? true : false 
    // console.log("reload")
    const [data, setData] = useState(props.data.map((item, index) => {
        const keyName =  index + item.key.toLowerCase().replace('/\s+/g', '')
        const valueName = index + item.value.toLowerCase().replace('/\s+/g', '')

        return {isNew: false, itemID: index, ...item}
    })) // Initialize state once with props

    function handleRemove(event){
        event.preventDefault()
        const idToRemove = event.currentTarget.id

        setData(prevData => {
            return prevData.filter(item => {
                if (item.itemID != idToRemove){
                    return item
                }
            })
        })
    }

    function handleSubmit(event){
        event.preventDefault()
        // const {isNew, ...submissionData} = data //no, I don't undeerstand how this works... Smart AI
        props.submit(data)

    }

    function handleNew(event){
        event.preventDefault()
        const newId = data.reduce((aggr, item) => {
            return item.itemID > aggr ? item.itemID : aggr
        }, 0) + 1
        const newKeyName = newId + "key"
        const newValueName = newId + "value"
        setData(prevData => [...prevData, {isNew: true, itemID: newId, key: "Key", value: "Value" }])
    }

    function handleKeyChange(event){
        const newKey = event.currentTarget.value
        const itemID = event.currentTarget.id
        setData(prevData => {
           return prevData.map(item => {
                return item.itemID == itemID ? {...item, key: newKey} : item
            })
        })


    }

    function handleValueChange(event){
        const newValue = event.currentTarget.value
        const itemID = event.currentTarget.id
        setData(prevData => {
           return prevData.map(item => {
                return item.itemID == itemID ? {...item, value: newValue} : item
            })
        })  
    }

    const itemMarkup = data.map(item => {
        return(
            <li key={item.itemID} id={item.itemID} className={item.isNew ? "p-1 border-orange-600 border-1 rounded" :"p-1"}>
                    <input
                        className="m-1 rounded p-1 bg-transparent text-" 
                        type="text" 
                        onChange={handleKeyChange}
                        value={item.key}
                        id={item.itemID}
                        >
                    </input>
                    <input 
                        className="m-1 rounded p-1 text-black" 
                        type="text" 
                        onChange={handleValueChange}
                        value={item.value}
                        id={item.itemID}
                    ></input>
                    <button 
                        onClick={handleRemove}
                        className="basic-button bg-red-500"
                        id={item.itemID}
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
                onClick={handleNew}
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