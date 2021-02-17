const { response } = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Folder = require('../models/Folder');
const Design = require('../models/Design');
const { successResponse, badRequest, internalServerError, createdSuccessful, unauthorized } = require('../utils/responses');
const mongoose = require('mongoose');

const getRecentDesigns = async (req, res = response) => {
    const { uid } = req;
    try {
        const designs = await Design.find({ privileges: { $elemMatch: { user: uid, type: 0 } } })
            .sort({ updatedOn: -1 })
            .limit(5)
            .populate('metadata.category')
            .populate('owner', 'name lastname');
        return successResponse('Diseños recientes obtenidos con éxito.', designs, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

const getUserDesignsAndFoldersByPath = async (req, res = response) => {
    const { uid } = req;
    let { path, from, limit } = req.body;
    from = from || 0;
    limit = limit || 12;
    if (!uid) return badRequest('No se ha especificado un usuario.', res);
    if (!path) return badRequest('No se ha especificado un carpeta.', res);
    try {
        const folder = await Folder.findOne({ path, owner: uid });
        const numOfDesigns = await Design.countDocuments({ owner: uid, folder: folder.id });
        const designs = await Design.find({ owner: uid, folder: folder.id })
            .skip(from)
            .limit(limit)
            .populate('metadata.category')
            .populate('owner', 'name lastname')
            .populate('folder', 'owner path parent');
        return successResponse('Diseños obtenidos con éxito.', { ownerId: uid, from: from + limit, nPages : Math.ceil(numOfDesigns / limit),  designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

const getDesignsSharedWithUser = async (req, res = response) => {
    return successResponse('getDesignsSharedWithUser: Connected!!', ['Design#1', 'Design#2', 'Design#3'], res);
}

const deleteDesign = async (req, res = response) => {
    const { uid } = req;
    const id = req.params.id;
    if (!id) return badRequest('No se ha especificado un diseño.', res);
    try {
        const design = await Design.findById(id);
        if (design.owner.toString() !== uid) return unauthorized('Usted no está autorizado para eliminar este diseño.', res);
        const deleted = await Design.findByIdAndDelete(id);
        return successResponse('Se ha eliminado el diseño con éxito.', deleted, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

const getPublicDesignsByUser = async (req, res = response) => {
    let { id, from, limit } = req.body;
    from = from || 0;
    limit = limit || 12;
    if (!id) return badRequest('No se ha especificado un usuario.', res);
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('No existe usuario con la id especificada.', res);
    try {
        const user = User.findById(id);
        if (!user) return badRequest('No existe usuario con la id especificada.', res);
        const numOfDesigns = await Design.countDocuments({ owner: id, 'metadata.public': true });
        const designs = await Design.find({ owner: id, 'metadata.public': true })
            .skip(from)
            .limit(limit)
            .populate('metadata.category')
            .populate('owner', 'name lastname')
            .populate('folder', 'owner path parent');
        return successResponse('Se han obtenido con éxito los diseños públicos del usuario especificado.', { ownerId: id, from: from + limit, nPages : Math.ceil(numOfDesigns / limit), designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

module.exports = {
    getRecentDesigns,
    getUserDesignsAndFoldersByPath,
    getDesignsSharedWithUser,
    deleteDesign,
    getPublicDesignsByUser,
};