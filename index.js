const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ihpbk8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const biodataCollection = client.db("trueBond").collection("biodatas");
    const reviewCollection = client.db("trueBond").collection("reviews");
    const userCollection = client.db("trueBond").collection("users");

    // users related api
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });


    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exist
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User Already Exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);

    })

    app.patch('/users/premium/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'premium'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);

    })

    // Search users by username
    app.get('/users/search', async (req, res) => {
      const username = req.query.username;
      if (!username) {
        return res.status(400).send({ message: 'Username query parameter is required' });
      }
      const query = { name: { $regex: username, $options: 'i' } }; // Case-insensitive search
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // review related api
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // biodata related api
    app.get('/biodatas', async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    })


    app.put('/biodatas', async (req, res) => {
      const item = req.body;
      const result = await biodataCollection.insertOne(item);
      res.send(result)
    })


    app.get('/biodatas/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await biodataCollection.findOne(query);
      res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Alhamdulillah,TrueBond Server is Running')
});

app.listen(port, () => {
  console.log(`TrueBond server is running on port ${port}`);
})