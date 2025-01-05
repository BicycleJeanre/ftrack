// Forms related components for database management

import { useState, FormEvent, useEffect } from 'react';
import React from 'react';
// import { useEffect, useState } from 'react';
import { listTablesQuery, deleteTableQuery } from '../../lib/dbQueries';

export const CreateDatabaseForm = ({ onSubmit }: { onSubmit: (dbName: string) => void }) => {
    const [dbName, setDbName] = useState('');

    return (
        <div>
            <h2 className="text-xl font-bold mb-2">Create Database</h2>
            <form onSubmit={(e) => {
                e.preventDefault();
                onSubmit(dbName);
                setDbName(''); // Clear the input after submission
            }} className="flex flex-wrap gap-2 mb-5 border-2 border-blue-500 p-2 rounded-md">
                <input
                    type="text"
                    value={dbName}
                    onChange={(e) => setDbName(e.target.value)}
                    placeholder="Enter database name"
                    required
                    className="border border-gray-300 rounded-md p-1"
                />
                <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md cursor-pointer">Create Database</button>
            </form>
        </div>
    );
};

export const DeleteDatabaseList = ({ databases, onDelete }: { databases: string[]; onDelete: (dbName: string) => void }) => {
    return (
        <div>
            <h2 className="text-xl font-bold mb-2">Delete Database</h2>
            <div className="grid grid-cols-auto-fill gap-2 border-2 border-blue-500 p-2 rounded-md">
                {databases.map((db, index) => (
                    <div key={index} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md cursor-pointer" onClick={() => onDelete(db)}>{db}</div>
                ))}
            </div>
        </div>
    );
};

export const CreateAccountsTable: React.FC = () => {
    const handleCreateTable = async () => {
        try {
            const response = await fetch('/api/maintainDB', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'createAccountsTable' }),
            });
            // Additional implementation...
        } catch (error) {
            console.error('Error creating accounts table:', error);
        }
    };
    return (
                <button onClick={handleCreateTable} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md cursor-pointer">Create Accounts Table</button>

    );
};

export const ShowTables: React.FC<{ tables: string[]; onDelete: (tableName: string) => void }> = ({ tables, onDelete }) => {
    return (
        <ul>
            {tables.map((table) => (
                <li key={table}>
                    {table}
                    <button onClick={() => onDelete(table)} className="ml-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded">
                        Delete
                    </button>
                </li>
            ))}
        </ul>
    );
};

export const PrepareDB: React.FC<{ db: any }> = ({ db }) => {
    const [tables, setTables] = useState<string[]>([]);

    const fetchTables = async () => {
        const fetchedTables = await listTablesQuery(db); // Fetch the list of tables with the db connection
        setTables(fetchedTables);
    };

    const handleDeleteTable = async (tableName: string) => {
        await deleteTableQuery(tableName); // Call the delete function
        fetchTables(); // Refresh the table list after deletion
    };

    useEffect(() => {
        fetchTables(); // Fetch tables when the component mounts
    }, []);

    return (
        <div className="border-2 border-blue-500 p-2 rounded-md">
            <h2 className="text-xl font-bold mb-2">Prepare Database</h2>
            <CreateAccountsTable />
            <h3 className="text-lg font-bold mb-2">Tables:</h3>
            <ShowTables tables={tables} onDelete={handleDeleteTable} />
        </div>
    );
};
