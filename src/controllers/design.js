const { response } = require('express');
const User = require('../models/User');
const Folder = require('../models/Folder');
const Design = require('../models/Design');
const Category = require('../models/Category');
const { successResponse, badRequest, internalServerError, createdSuccessful, unauthorized } = require('../utils/responses');
const mongoose = require('mongoose');
const { caseAndAccentInsensitive } = require('../utils/text');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const designRoomList = require('../models/DesignRoomList');

const getRecentDesigns = async (req, res = response) => {
    const { uid } = req;
    try {
        const designs = await Design.find({ privileges: { $elemMatch: { user: uid, type: 0 } } })
            .sort({ updatedAt: -1 })
            .limit(5)
            .populate({ path: 'metadata.category', model: Category })
            .populate('owner', 'name lastname img occupation');
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
        if (!folder) return badRequest('La carpeta especificada no existe.', res);
        const numOfDesigns = await Design.countDocuments({ owner: uid, folder: folder.id });
        const designs = await Design.find({ owner: uid, folder: folder.id })
            .skip(from)
            .limit(limit)
            .sort({ updatedAt: -1 })
            .populate({ path: 'metadata.category', model: Category })
            .populate('owner', 'name lastname img occupation')
            .populate('folder', 'owner path parent');
        return successResponse('Diseños obtenidos con éxito.', { ownerId: uid, from: from + limit, nPages : Math.ceil(numOfDesigns / limit),  designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

const getDesignsSharedWithUser = async (req, res = response) => {
    const { uid } = req;
    let { from, limit } = req.body;
    from = from || 0;
    limit = limit || 12;
    if (!uid) return badRequest('No se ha especificado un usuario.', res);
    try {
        const numOfDesigns = await Design.countDocuments({ owner: { $ne: uid}, privileges: { $elemMatch: { user: uid } } });
        const designs = await Design.find({ owner: { $ne: uid}, privileges: { $elemMatch: { user: uid } } })
            .skip(from)
            .limit(limit)    
            .sort({ updatedAt: -1 })
            .populate({ path: 'metadata.category', model: Category })
            .populate('owner', 'name lastname img occupation');
        return successResponse('Diseños obtenidos con éxito.', { ownerId: uid, from: from + limit, nPages : Math.ceil(numOfDesigns / limit),  designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

const deleteDesign = async (req, res = response) => {
    const { uid } = req;
    const id = req.params.id;
    if (!id) return badRequest('No se ha especificado un diseño.', res);
    try {
        const design = await Design.findById(id);
        if (design.owner.toString() !== uid) return unauthorized('Usted no está autorizado para eliminar este diseño.', res);
        const designRoom = designRoomList.getDesignRoomById(id);
        if (!!designRoom && designRoom.getUsers().length > 0) return unauthorized('No es posible eliminar el diseño porque existen usuarios editando su diseño. Por favor intente nuevamente cuando no hayan usuarios editandolo.', res);
        await Design.updateMany({ origin: design.id }, { $unset: { origin: 1 } }, { new: true });
        const deleted = await Design.findByIdAndDelete(id);
        designRoomList.removeDesignRoom(id);
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
        const numOfDesigns = await Design.countDocuments({ owner: id, 'metadata.isPublic': true });
        const designs = await Design.find({ owner: id, 'metadata.isPublic': true })
            .skip(from)
            .limit(limit)
            .populate({ path: 'metadata.category', model: Category })
            .populate('owner', 'name lastname img occupation')
            .populate('folder', 'owner path parent');
        return successResponse('Se han obtenido con éxito los diseños públicos del usuario especificado.', { ownerId: id, from: from + limit, nPages : Math.ceil(numOfDesigns / limit), designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const updateTLADesing = async( req, res = response ) => {
    const { uid } = req;
    const id = req.params.id;
    const { title, description } =  req.body;
    console.log(title)
    if (!id) return badRequest('No se ha especificado un diseño.', res);
    try {
        let design = await Design.findById( id );
        console.log(design.owner)
        if (design.owner.toString() !== uid) return unauthorized('Usted no está autorizado para editar este diseño.', res);
        design = await Design.findByIdAndUpdate(id, title, { rawResult: true });
        return successResponse('TLA del diseño editado', id, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const createDesign = async (req, res = response) => {
    const { uid } = req;
    let { path, isPublic } = req.body;
    if (!path) return badRequest('No se ha especificado un carpeta.', res);
    isPublic = isPublic !== null ? isPublic : false;
    try {
        const folder = await Folder.findOne({ path, owner: uid });
        if (!folder) return badRequest('No existe carpeta con la ruta especificada.', res);
        newDesign = {
            folder: folder._id,
            metadata: {
                name: 'Nuevo Diseño',
                isPublic: isPublic,
                scoreMean: 0,
                category: mongoose.Types.ObjectId('603428218fe538f505b5ac90'),
                results: [],
                workingTime: {
                    hours: 0,
                    minutes: 0,
                },
                workingTimeDesign: {
                    hours: 0,
                    minutes: 0,
                },
                priorKnowledge: '',
                description: '',
                objetive: '',
                evaluation: '',
                evaluationPattern: '',
                classSize: 0,
            },
            data: {
                learningActivities: []
            },
            comments: [],
            assessments: [],
            owner: uid,
            privileges: [{
                user: mongoose.Types.ObjectId(uid),
                type: 0,
            }],
            readOnlyLink: uuidv4(),
            keywords: [],
        };
        const design = new Design(newDesign);
        const designSaved = await design.save({ new: true });
        return createdSuccessful('Diseño creado con éxito', {design: designSaved}, res);
        
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const getPublicFilteredDesigns = async (req, res = response) => {
    let { filter, keywords, categories, from, limit } = req.body;
    from = from || 0;
    limit = limit || 12;
    try {
        const keywordFilter = [];
        const categoriesFilter = [];
        const mainFilter = [];
        keywords.forEach(keyword => {
            keywordFilter.push({
                'keywords': { '$elemMatch': {'$regex' : `.*${caseAndAccentInsensitive(keyword)}.*`, '$options' : 'i'} }
            });
        });
        categories.forEach(category => {
            categoriesFilter.push({
                'metadata.category': mongoose.Types.ObjectId(category._id)
            });
        });
        filter.split(' ').forEach(word => {
            if(word.trim().length) {
                mainFilter.push(...[
                    { 'owner.name': {'$regex' : `.*${caseAndAccentInsensitive(word)}.*`, '$options' : 'i'} },
                    { 'owner.lastname': {'$regex' : `.*${caseAndAccentInsensitive(word)}.*`, '$options' : 'i'} },
                    { 'metadata.name': {'$regex' : `.*${caseAndAccentInsensitive(word)}.*`, '$options' : 'i'} },
                ]);
            }
        });
        const aggregation = [
            { $match: { $and: [
                { 'metadata.isPublic': true },
                ...keywordFilter,
                categoriesFilter.length ? { $or: categoriesFilter } : {},
            ] } },
            { $lookup: {
                'from': 'users',
                'let': {'ownerId': '$owner'}, 
                'pipeline': [
                    { $match: { "$expr": { "$eq": [ "$_id", "$$ownerId" ] } } },
                    { $project: { name: 1, lastname: 1, email: 1, img: 1, occupation: 1 }  },
                ],
                'as': 'owner',
            } },
            { $unwind: "$owner" },
            { $match: mainFilter.length ? { $or: mainFilter } : {} },
            { $lookup: {from: 'categories', localField: 'metadata.category', foreignField: '_id', as: 'metadata.category'} },
            { $unwind: "$metadata.category" },
            { $sort: { "metadata.scoreMean": -1, "updatedAt": -1 } },
        ];
        const numOfDesigns = await Design.aggregate([...aggregation, {$count: "designs"}]);
        const designs = await Design.aggregate([...aggregation, {$skip: from }, {$limit: limit}]);
        const nPages = numOfDesigns.length ? Math.ceil(numOfDesigns[0].designs / limit) : 0;
        return successResponse('Se han filtrado con éxito los diseños públicos.', { from: from + limit, nPages, designs }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const getDesignByLink = async (req, res = response) => {
    let { link } = req.params;
    if (!link || (link && link.trim().length === 0)) return badRequest('No se ha especificado un enlace.', res);
    try {
        if(!uuidValidate(link)) return badRequest('El enlace no es válido.', res);
        const design = await Design.findOne({ readOnlyLink: link })
            .populate({ path: 'metadata.category', model: Category })
            .populate('privileges.user', 'name lastname email img occupation')
            .populate('comments.user', 'name lastname email img occupation')
            .populate({ path: 'origin', select: 'metadata.name metadata.isPublic owner privileges', 
                populate: [
                    { path: 'owner', model: User, select: 'name lastname img occupation'}, 
                    { path: 'privileges.user', model: User, select: 'name lastname img occupation'}]
                } );
        if(!design) return badRequest('No se ha encontrado diseño con el enlace especificado.', res);
        return successResponse('Se ha encontrado el diseño con éxito.', { design }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const duplicateDesign = async (req, res = response) => {
    const { uid } = req;
    let { id } = req.body;
    if (!id || (id && id.trim().length === 0)) return badRequest('No se ha especificado un diseño para duplicar.', res);
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('No existe diseño de aprendizaje con la id especificada.', res);
    try {
        const design = await Design.findById(id);
        if(!design) return badRequest('No existe diseño de aprendizaje con la id especificada.', res);
        const folder = await Folder.findOne({ owner: uid, path: '/' });
        if(!folder) return badRequest('Error con la carpeta del diseño especificado.', res);
        let newData = design.data;
        newData.learningActivities.forEach((la, index)=>{
            la.id = mongoose.Types.ObjectId().toString();
            la.tasks.forEach((task, i) => {
                task.id = mongoose.Types.ObjectId().toString();
            });
        });
        const newDesignJson = {
            folder: folder._id,
            metadata: {
                name: design.metadata.name + ' (Duplicado)',
                isPublic: false,
                scoreMean: 0,
                workingTimeDesign: design.metadata.workingTimeDesign,
                category: design.metadata.category,
                results: design.metadata.results,
                workingTime: design.metadata.workingTime,
                classSize: design.metadata.classSize,
                description: design.metadata.description,
                priorKnowledge: design.metadata.priorKnowledge,
                objective: design.metadata.objective,
                evaluation: design.metadata.evaluation,
                evaluationPattern: design.metadata.evaluationPattern,
            },
            data: design.data,
            comments: [],
            assessments: [],
            owner: uid,
            privileges: [{
                user: mongoose.Types.ObjectId(uid),
                type: 0,
            }],
            readOnlyLink: uuidv4(),
            keywords: design.keywords,
            origin: mongoose.Types.ObjectId(id),
        };

        const newDesign = new Design(newDesignJson);
        await newDesign.save();
        return successResponse('Diseño duplicado con éxito.', { newDesign }, res);
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
};

const importDesign = async (req, res = response) => {
    const { uid } = req;
    const { design, path, filename } = req.body;
    if (!filename) return badRequest('No se ha recibido un archivo.', res);
    if (!path) return badRequest('No se ha especificado una ruta válida.', res);
    if (!design) return badRequest('No se ha recibido un diseño de aprendizaje.', res);
    try {
        const folder = await Folder.findOne({ owner: uid, path });
        if(!folder) return badRequest('Error con la carpeta especificada.', res);
        try {
            if(
                !('data' in design) ||
                !('metadata' in design) ||
                !('name' in design.metadata) ||
                !('isPublic' in design.metadata) ||
                !('scoreMean' in design.metadata) ||
                !('category' in design.metadata) ||
                !('results' in design.metadata) ||
                !('workingTime' in design.metadata) ||
                !('workingTimeDesign' in design.metadata) ||
                !('classSize' in design.metadata) ||
                !('description' in design.metadata) ||
                !('priorKnowledge' in design.metadata) ||
                // !('objetive' in design.metadata) ||
                !('evaluation' in design.metadata) ||
                !('evaluationPattern' in design.metadata) ||
                !('comments' in design) ||
                !('assessments' in design) ||
                !('keywords' in design) ||
                !('learningActivities' in design.data)
            ) throw new Error('Invalid data structure');
            design.owner = mongoose.Types.ObjectId(uid);
            design.folder = mongoose.Types.ObjectId(folder._id);
            design.metadata.category = mongoose.Types.ObjectId(design.metadata.category._id);
            design.metadata.isPublic = false;
            design.privileges.push({
                user: mongoose.Types.ObjectId(uid),
                type: 0,
            });
            design.readOnlyLink = uuidv4();
            const newDesign = new Design(design);
            await newDesign.save();
            return successResponse(`Diseño ${design.metadata.name} importado con éxito.`, { newDesign }, res);
        } catch (e) {
            console.log(e);
            return badRequest(`Error al intentar importar el diseño desde el archivo "${filename}". El archivo está corrupto.`, res);
        }
    } catch (error) {
        console.log(error);
        return internalServerError('Porfavor hable con el administrador.', res);
    }
}

module.exports = {
    getRecentDesigns,
    getUserDesignsAndFoldersByPath,
    getDesignsSharedWithUser,
    deleteDesign,
    getPublicDesignsByUser,
    updateTLADesing,
    createDesign,
    getPublicFilteredDesigns,
    getDesignByLink,
    duplicateDesign,
    importDesign
};
