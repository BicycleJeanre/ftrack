// Forms related components for database management

import { useState, FormEvent } from 'react';
import React from 'react';

export const CreateDatabaseForm = ({ onSubmit }: { onSubmit: (dbName: string) => void }) => {
    const [dbName, setDbName] = useState('');

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(dbName);
        setDbName(''); // Clear the input after submission
    };

    return (
        <div>
            <h2 className="text-xl font-bold mb-2">Create Database</h2>
            <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-5 border-2 border-blue-500 p-2 rounded-md">
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

export const PrepareDB: React.FC = () => {
    return (
        <div className="border-2 border-blue-500 p-2 rounded-md">
            <h2 className="text-xl font-bold mb-2">Prepare Database</h2>
            <CreateAccountsTable />
        </div>
    );
};
