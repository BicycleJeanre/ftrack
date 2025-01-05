import { pool } from '../../lib/db';
import { createDatabaseQuery, dropDatabaseQuery, listDatabasesQuery, createAccountsTable, listTablesQuery, deleteTableQuery } from '../../lib/dbQueries';
import { NextApiRequest, NextApiResponse } from 'next';

interface CustomNextApiRequest extends NextApiRequest {
    db: any;
}

export default async function handler(req: CustomNextApiRequest, res: NextApiResponse) {
  // Establish database connection
  // Assign the pool instance directly to req.db
  req.db = pool; 

  if (req.method === 'POST') {
    const { action, dbName } = req.body;

    if (action === 'createAccountsTable') {
      return handleCreateAccountsTable(req, res);
    } else if (!dbName) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    try {
      console.log(`Attempting to create database: ${dbName}`);
      await req.db.query(createDatabaseQuery(dbName));
      res.status(200).json({ message: `Database ${dbName} created successfully` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error creating database' });
    }
  } else if (req.method === 'DELETE') {
    const { dbName, tableName } = req.body;

    if (dbName) {
      if (!dbName) {
        return res.status(400).json({ error: 'Database name is required' });
      }

      try {
        console.log(`Attempting to drop database: ${dbName}`);
        await req.db.query(dropDatabaseQuery(dbName));
        res.status(200).json({ message: `Database ${dbName} removed successfully` });
      } catch (error) {
        console.error('Database removal error:', error);
        res.status(500).json({ error: 'Error removing database' });
      }
    } else if (tableName) {
      if (!tableName) {
        return res.status(400).json({ error: 'Table name is required' });
      }

      try {
        console.log(`Attempting to delete table: ${tableName}`);
        await deleteTableQuery(req.db, tableName);
        res.status(200).json({ message: `Table ${tableName} deleted successfully` });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error deleting table' });
      }
    } else {
      return res.status(400).json({ error: 'Either database name or table name is required' });
    }
  } else if (req.method === 'GET') {
    const { listTables } = req.query;

    if (listTables) {
      try {
        const tables = await listTablesQuery(req.db);
        res.status(200).json({ tables });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching tables' });
      }
    } else {
      try {
        const result = await req.db.query(listDatabasesQuery());
        const databases = result.rows.map(row => row.datname);
        res.status(200).json({ databases });
      } catch (error) {
        console.error('Error fetching databases:', error);
        res.status(500).json({ error: 'Error fetching databases' });
      }
    }
  } else {
    res.setHeader('Allow', ['POST', 'DELETE', 'GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export const handleCreateAccountsTable = async (req: CustomNextApiRequest, res: NextApiResponse) => {
    try {
        await createAccountsTable(req.db);
        res.status(200).json({ message: 'Accounts table created successfully.' });
    } catch (error) {
        console.error('Error creating accounts table:', error);
        res.status(500).json({ message: 'Failed to create accounts table.' });
    }
};
