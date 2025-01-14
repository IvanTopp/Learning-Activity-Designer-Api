const { Schema, model } = require('mongoose');

const UserSchema = Schema({
    name: {type: String, required: true},
    lastname: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    occupation: { type: String },
    scoreMean: {type: Number, required: true},
    institution: { type: String },
    country: { type: String },
    img: { type: String, default: '' },
    city: { type: String },
    description: { type: String },
    color: { type: String, required: true },
    contacts: { type: [{type: Schema.Types.ObjectId, ref: 'User'}] },
}, { timestamps: true });

UserSchema.index({
    name: 'text',
    lastname: 'text',
    email: 'text',
    city: 'text',
    country: 'text',
});

UserSchema.methods.toJSON = function () {
    const doc = this;
    const obj = doc.toObject();
    delete obj.password;
    delete obj.__v;
    return obj;
}

module.exports = model('User', UserSchema, 'users');