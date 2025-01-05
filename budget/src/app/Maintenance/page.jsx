import KeyValue from '@/components/KeyValue'

export default function Maintenance(){
    const connectionDetails = [
        {id: 1, keyName: "serverName", keyDescription: "Server Name", valueDescription:"localhost", valueName:"localhost"},
        {id: 2, keyName: "databaseName", keyDescription: "Database Name", valueDescription:"budget", valueName:"budget"}
    ]

    return(
        <main className="main-page-layout">
            <h1 className="text-white text-3xl">Maintenance</h1>
            <KeyValue data={connectionDetails}/>
        </main>
    )
}