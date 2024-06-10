const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

// Middlewares
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174", "https://true-bond.netlify.app"],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ihpbk8d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware to log requests
const logger = (req, res, next) => {
  console.log('log: info', req.hostname, req.originalUrl);
  next();
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log('token in the middleware', token);
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    // await client.connect();

    const biodataCollection = client.db("trueBond").collection("biodatas");
    const userCollection = client.db("trueBond").collection("users");
    const favoritesCollection = client.db("trueBond").collection("favorites");
    const paymentCollection = client.db("trueBond").collection("payments");
    const successStoryCollection = client.db("trueBond").collection("stories");

    // JWT generator
    app.post('/jwt', logger, async (req, res) => {
      const user = req.body;
      console.log(user);

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d'
      });

      // Log the generated token
      console.log('Generated Token:', token);


      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' ? true : false,
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Logout route
    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log('logging out', user);
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production' ? true : false,
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // got married & success-story related api
    app.post('/success-stories', async (req, res) => {
      const newStory = req.body;
      const result = await successStoryCollection.insertOne(newStory);
      res.send(result);
    })




    app.get('/success-stories', async (req, res) => {
      try {
        const { selfBiodataId, partnerBiodataId } = req.query;
        let query = {};

        // Filter by both self and partner biodata IDs if provided
        if (selfBiodataId && partnerBiodataId) {
          query = {
            $or: [
              { selfBiodataId: selfBiodataId, partnerBiodataId: partnerBiodataId },
              { selfBiodataId: partnerBiodataId, partnerBiodataId: selfBiodataId }
            ]
          };
        } else if (selfBiodataId) {
          // Filter by self biodata ID only if provided
          query = { selfBiodataId: selfBiodataId };
        } else if (partnerBiodataId) {
          // Filter by partner biodata ID only if provided
          query = { partnerBiodataId: partnerBiodataId };
        }

        const result = await successStoryCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching success stories' });
      }
    });



    // Users related API
    app.get('/premium-profiles', async (req, res) => {
      try {
        const sortOrder = req.query.sortOrder === 'descending' ? -1 : 1;
        const pipeline = [
          { $match: { role: 'premium' } },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          { $unwind: '$biodata' },
          { $sort: { 'biodata.age': sortOrder } },
          {
            $project: {
              _id: '$biodata._id',
              email: 1,
              name: '$biodata.name',
              biodataType: '$biodata.biodataType',
              profileImageUrl: '$biodata.profileImageUrl',
              age: '$biodata.age',
              occupation: '$biodata.occupation',
              permanentDivision: '$biodata.permanentDivision',
              biodataId: '$biodata.biodataId'
            }
          }
        ];
        const result = await userCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching premium profiles:', error);
        res.status(500).send({ message: 'Error fetching premium profiles' });
      }
    });

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/requested-premium', verifyToken, async (req, res) => {
      try {
        const pipeline = [
          { $match: { status: 'Requested for Premium' } },
          {
            $lookup: {
              from: 'biodatas',
              localField: 'email',
              foreignField: 'contactEmail',
              as: 'biodata'
            }
          },
          { $unwind: { path: '$biodata', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              email: '$biodata.contactEmail',
              name: '$biodata.name',
              biodataType: '$biodata.biodataType',
              biodataId: '$biodata.biodataId',
              role: '$biodata.role',
              id: '$users._id'
            }
          }
        ];
        const result = await userCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching requested premium users:', error);
        res.status(500).send({ message: 'Error fetching requested premium users' });
      }
    });

    app.get('/users/premium', async (req, res) => {
      const query = { role: 'premium' };
      try {
        const result = await userCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching premium users' });
      }
    });

    app.put('/user', async (req, res) => {
      const user = req.body;
      console.log('Received user data:', user);
      const query = { email: user?.email };

      if (!user || !user?.email) {
        return res.status(400).send({ message: "User email is required" });
      }

      try {
        const isExist = await userCollection.findOne(query);

        if (isExist) {
          if (user.status === 'Requested for Premium') {
            const result = await userCollection.updateOne(query, {
              $set: { status: user?.status }
            });
            return res.send(result);
          } else {
            return res.send(isExist);
          }
        }

        const options = { upsert: true };
        const updateDoc = {
          $set: {
            ...user,
            timestamp: Date.now()
          }
        };
        const result = await userCollection.updateOne(query, updateDoc, options);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });




    app.get('/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    app.patch('/users/admin/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.patch('/users/premium/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'premium' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });


    app.get('/users/search', async (req, res) => {
      const username = req.query.username;
      if (!username) {
        return res.status(400).send({ message: 'Username query parameter is required' });
      }
      const query = { name: { $regex: username, $options: 'i' } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // biodatas related api
    app.get('/biodatas', async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    app.get('/myBiodata/:contactEmail', async (req, res) => {
      const result = await biodataCollection.find({ contactEmail: req.params.contactEmail }).toArray();
      res.send(result);
    });


    app.put('/biodatas', async (req, res) => {
      const biodata = req.body;
      const query = { contactEmail: biodata?.contactEmail };

      try {
        const existingBiodata = await biodataCollection.findOne(query);
        let biodataId;

        if (!existingBiodata || !existingBiodata.biodataId) {
          const count = await biodataCollection.countDocuments();
          biodataId = count + 1;
        } else {
          biodataId = existingBiodata.biodataId;
        }

        const options = { upsert: true };
        const updateDoc = { $set: { ...biodata, biodataId } };
        const result = await biodataCollection.updateOne(query, updateDoc, options);

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
      }
    });


    app.get('/biodatas/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });


    // for fetching similar biodata
    app.get('/biodatas/:id/similar', async (req, res) => {
      const id = req.params.id;

      try {
        const biodata = await biodataCollection.findOne({ _id: new ObjectId(id) });

        //  find similar biodata entries by biodataType
        const similarBiodata = await biodataCollection.find({ biodataType: biodata.biodataType }).limit(5).toArray();

        res.send(similarBiodata);
      } catch (error) {
        console.error('Error fetching similar biodata:', error);
        res.status(500).send({ message: 'Error fetching similar biodata' });
      }
    });


    //  admin-stats related api
    app.get('/admin-stats', verifyToken, async (req, res) => {
      try {
        const totalBiodata = await biodataCollection.estimatedDocumentCount();
        const [maleBiodataCount, femaleBiodataCount] = await Promise.all([
          biodataCollection.countDocuments({ biodataType: "Male" }),
          biodataCollection.countDocuments({ biodataType: "Female" }),
        ]);
        const premiumBiodataCount = await userCollection.countDocuments({ role: "premium" });

        const payments = await paymentCollection.find().toArray();
        const revenue = payments.reduce((total, item) => total + item.price, 0);

        res.send({
          totalBiodata,
          maleBiodataCount,
          femaleBiodataCount,
          premiumBiodataCount,
          revenue
        });
      } catch (error) {
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

    // counter section related api
    app.get('/counter-section', async (req, res) => {
      try {
        const totalBiodata = await biodataCollection.estimatedDocumentCount();
        const [maleBiodataCount, femaleBiodataCount] = await Promise.all([
          biodataCollection.countDocuments({ biodataType: "Male" }),
          biodataCollection.countDocuments({ biodataType: "Female" }),
        ]);

        res.send({
          totalBiodata,
          maleBiodataCount,
          femaleBiodataCount,
        });
      } catch (error) {
        res.status(500).send({ message: 'Error fetching biodata stats' });
      }
    });

    // favorites related api

    app.post('/favorites', async (req, res) => {
      const biodata = req.body;
      const result = await favoritesCollection.insertOne(biodata);
      res.send(result);
    })


    app.get('/favorites', async (req, res) => {

      const result = await favoritesCollection.find().toArray();
      res.send(result);
    });


    app.get('/favorites/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await favoritesCollection.find({ email }).toArray();
      res.send(result);
    });


    app.delete('/favorites/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: id }
      try {
        const result = await favoritesCollection.deleteOne(query);
        res.send(result);
        console.log(result);
      } catch (error) {
        res.status(500).send({ message: 'Error deleting favorite' });
      }
    });



    // payment related api
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    // payment intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount, 'amount inside the intent');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      console.log('payment info', payment);
      res.send(paymentResult);
    })

    app.patch('/payments/contact/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { status: 'Approved' } };
      const result = await paymentCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/payments/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await paymentCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });


    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    // console.error('Error connecting to MongoDB:', error);
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Alhamdulillah, TrueBond Server is Running');
});

app.listen(port, () => {
  console.log(`TrueBond server is running on port ${port}`);
});

