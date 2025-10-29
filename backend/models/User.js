import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const userSchema = new Schema({
    name:String,
    email:{type:String,unique:true, required: true },
    googleId:String,//store Google ID
    password:String // optional if also doing local login
},
{timestamps:true}
);

const User = mongoose.model('User',userSchema); 
export default User;

