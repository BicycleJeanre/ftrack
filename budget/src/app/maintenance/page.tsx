"use client";

import { useState, useEffect } from 'react';
import Layout from '../layout';
import { CreateDatabaseForm, DeleteDatabaseList, PrepareDB} from './forms';

export default function Maintenance() {
    const [dbName, setDbName] = useState('');
    const [databases, setDatabases] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    console.log('Initial databases state:', databases);

    console.log('Create Database form submitted with dbName:', dbName);
    const handleSubmit = async (dbName: string) => {
        console.log('Submit handler called'); // Log to check if the handler is triggered
        try {
            const response = await fetch('/api/maintainDB', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ dbName }),
            });

            const data = await response.json();
            console.log('Database creation response:', data);
            alert(data.message || data.error);
            fetchDatabases(); // This line ensures the grid is refreshed
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to create database. Please try again.');
        }
    };

    const fetchDatabases = async () => {
        console.log('Fetching databases...');
        setLoading(true); // Set loading to true before fetching
        try {
            const response = await fetch('/api/maintainDB');
            console.log('Database fetch response:', response);
            const data = await response.json();
            console.log('Databases retrieved:', data.databases);
            setDatabases(data.databases);
            console.log('Updated databases state:', data.databases);
        } catch (error) {
            console.error('Error fetching databases:', error);
        } finally {
            setLoading(false); // Set loading to false after fetching
        }
    };

    const handleDelete = async (dbName: string) => {
        if (confirm(`Are you sure you want to delete the database: ${dbName}?`)) {
            try {
                const response = await fetch('/api/maintainDB', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ dbName }),
                });
                const data = await response.json();
                alert(data.message || data.error);
                fetchDatabases(); // Refresh the database list after deletion
            } catch (error) {
                console.error('Error deleting database:', error);
                alert('Failed to delete database. Please try again.');
            }
        }
    };

    useEffect(() => {
        fetchDatabases(); // Fetch databases when the component mounts
    }, []);

    return (
        <Layout>
            <h1>Database Maintenance</h1>
            <CreateDatabaseForm onSubmit={handleSubmit} />
            <DeleteDatabaseList databases={databases} onDelete={handleDelete} />
            <PrepareDB />
        </Layout>
    );
}
