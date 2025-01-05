import KeyValue from '@/components/KeyValue'

export default function Maintenance(){
    const connectionDetails = [
        {id: 1, keyName: 1, keyDescription: "Server Name", value:"localhost"},
        {id: 2, keyName: 2, keyDescription: "Database Name", value:"budget"}
    ]

    return(
        <main className="main-page-layout">
            <h1 className="text-white text-3xl">Maintenance</h1>
            <KeyValue data={connectionDetails}/>
        </main>
    )
}