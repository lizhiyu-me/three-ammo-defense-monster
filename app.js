///<reference path="./definitions/three.d.ts"/>
///<reference path="./definitions/detector.d.ts"/>
///<reference path="./definitions/ammo.d.ts"/>
var Engine = /** @class */ (function () {
    function Engine(element, clearColor) {
        this.clock = new THREE.Clock();
        this.rigidBodies = new Array();
        this.tempTransform = new Ammo.btTransform();
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setClearColor(clearColor);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        element.appendChild(this.renderer.domElement);
        this.scene = new THREE.Scene();
        // Physics configuration
        var collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        var dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        var overlappingPairCache = new Ammo.btAxisSweep3(new Ammo.btVector3(-1000, -1000, -1000), new Ammo.btVector3(1000, 1000, 1000));
        var solver = new Ammo.btSequentialImpulseConstraintSolver();
        this.physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
        this.physicsWorld.setGravity(new Ammo.btVector3(0, -16, 0));
    }
    Engine.prototype.enableShadows = function () {
        this.renderer.shadowMap.enabled = true;
    };
    Engine.prototype.setCamera = function (camera) {
        var _this = this;
        this.camera = camera;
        window.addEventListener('resize', function () {
            _this.camera.aspect = window.innerWidth / window.innerHeight;
            _this.camera.updateProjectionMatrix();
            _this.renderer.setSize(window.innerWidth, window.innerHeight);
        }, false);
    };
    Engine.prototype.getCamera = function () {
        return this.camera;
    };
    Engine.prototype.addLight = function (light) {
        this.light = light;
        this.scene.add(this.light);
    };
    Engine.prototype.addObject = function (object) {
        this.scene.add(object);
    };
    Engine.prototype.addPhysicsObject = function (object, body, mass) {
        object.userData.physicsBody = body;
        if (mass > 0) {
            this.rigidBodies.push(object);
            body.setActivationState(4); // Disable deactivation
        }
        this.scene.add(object);
        this.physicsWorld.addRigidBody(body);
    };
    Engine.prototype.updatePhysics = function (delta) {
        // Step world
        this.physicsWorld.stepSimulation(delta, 10);
        // Update rigid bodies
        var len = this.rigidBodies.length;
        for (var i = 0; i < len; i++) {
            var objThree = this.rigidBodies[i];
            var ms = objThree.userData.physicsBody.getMotionState();
            if (ms) {
                ms.getWorldTransform(this.tempTransform);
                var p = this.tempTransform.getOrigin();
                objThree.position.set(p.x(), p.y(), p.z());
                var q = this.tempTransform.getRotation();
                objThree.quaternion.set(q.x(), q.y(), q.z(), q.w());
            }
        }
    };
    Engine.prototype.update = function (isPhysicsEnabled) {
        var deltaTime = this.clock.getDelta();
        isPhysicsEnabled && this.updatePhysics(deltaTime);
        // gameOverChecker.call(this.rigidBodies);
        this.renderer.render(this.scene, this.camera);
        return deltaTime;
    };
    return Engine;
}());
//-------------------------------------------------------------------
var ShapeFactory = /** @class */ (function () {
    function ShapeFactory(engine) {
        this.engine = engine;
    }
    ShapeFactory.prototype.createRigidBody = function (threeObject, physicsShape, mass, pos, quat) {
        var transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
        transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
        var motionState = new Ammo.btDefaultMotionState(transform);
        var localInertia = new Ammo.btVector3(0, 0, 0);
        physicsShape.calculateLocalInertia(mass, localInertia);
        var rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, physicsShape, localInertia);
        var body = new Ammo.btRigidBody(rbInfo);
        this.engine.addPhysicsObject(threeObject, body, mass);
    };
    ShapeFactory.prototype.createParalellepiped = function (sx, sy, sz, mass, pos, quat, material) {
        var threeObject = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1), material);
        threeObject.position.copy(pos);
        threeObject.quaternion.copy(quat);
        var shape = new Ammo.btBoxShape(new Ammo.btVector3(sx * 0.5, sy * 0.5, sz * 0.5));
        shape.setMargin(0.05);
        this.createRigidBody(threeObject, shape, mass, pos, quat);
        return threeObject;
    };
    ShapeFactory.prototype.createSphere = function (radius, mass, pos, quat, material) {
        var threeObject = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 16), material);
        threeObject.position.copy(pos);
        threeObject.quaternion.copy(quat);
        var shape = new Ammo.btSphereShape(radius);
        shape.setMargin(0.05);
        this.createRigidBody(threeObject, shape, mass, pos, quat);
        return threeObject;
    };
    return ShapeFactory;
}());
//-------------------------------------------------------------------
var CameraMoveControls = /** @class */ (function () {
    function CameraMoveControls(camera) {
        this.moveLeft = false;
        this.moveRight = false;
        this.enabled = false;
        this.velocity = new THREE.Vector3(1, 1, 1);
        camera.rotation.set(0, 0, 0);
        this.pitchObject = new THREE.Object3D();
        this.pitchObject.add(camera);
        this.yawObject = new THREE.Object3D();
        this.yawObject.position.y = 10;
        this.yawObject.add(this.pitchObject);
        this.initEventListeners();
    }
    CameraMoveControls.prototype.getObject = function () {
        return this.yawObject;
    };
    CameraMoveControls.prototype.setPitchRotationX = function (x) {
        this.pitchObject.rotation.x = x;
    };
    CameraMoveControls.prototype.initEventListeners = function () {
        var _this = this;
        document.addEventListener('mousemove', function (event) { return _this.onMouseMove(event); }, false);
        document.addEventListener('keydown', function (event) { return _this.setMove(event.keyCode, true); }, false);
        document.addEventListener('keyup', function (event) { return _this.setMove(event.keyCode, false); }, false);
    };
    CameraMoveControls.prototype.onMouseMove = function (event) {
        if (this.enabled === false)
            return;
        var movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        var movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
        var factor = 0.002;
        this.yawObject.rotation.y -= movementX * factor;
        this.pitchObject.rotation.x -= movementY * factor;
        this.pitchObject.rotation.x = Math.max(-CameraMoveControls.PI_2, Math.min(CameraMoveControls.PI_2, this.pitchObject.rotation.x));
    };
    ;
    CameraMoveControls.prototype.setMove = function (keyCode, value) {
        if (this.enabled === false)
            return;
        switch (keyCode) {
            case 65: // a
                this.moveLeft = value;
                break;
            case 68: // d
                this.moveRight = value;
                break;
        }
    };
    CameraMoveControls.prototype.update = function (delta) {
        if (this.enabled === false)
            return;
        var factor = 10.0 * delta;
        this.velocity.x -= this.velocity.x * factor;
        var step = 400.0 * delta;
        if (this.moveLeft)
            this.velocity.x -= step;
        if (this.moveRight)
            this.velocity.x += step;
        this.yawObject.translateX(this.velocity.x * delta);
    };
    CameraMoveControls.PI_2 = Math.PI / 2;
    return CameraMoveControls;
}());
//-------------------------------------------------------------------
function lockPointer(controls) {
    var message = document.getElementById('message');
    var blocker = document.getElementById('blocker');
    var pointerlockerror = function (event) {
        document.addEventListener('keydown', function (event) {
            if (event.keyCode == 27) { // ESC
                controls.enabled = false;
                blocker.style.display = 'block';
                message.style.display = 'none';
            }
        }, false);
        message.innerHTML = document.getElementById('errorMessage').innerHTML;
        blocker.style.display = 'none';
        message.style.display = 'block';
        controls.enabled = true;
    };
    var havePointerLock = 'pointerLockElement' in document || 'mozPointerLockElement' in document || 'webkitPointerLockElement' in document;
    if (havePointerLock) {
        var _body_1 = document.body;
        var _doc_1 = document;
        _body_1.requestPointerLock = _body_1.requestPointerLock || _body_1.mozRequestPointerLock || _body_1.webkitRequestPointerLock;
        var pointerlockchange = function (event) {
            if (_doc_1.pointerLockElement === _body_1 || _doc_1.mozPointerLockElement === _body_1 || _doc_1.webkitPointerLockElement === _body_1) {
                controls.enabled = true;
                blocker.style.display = 'none';
                message.style.display = 'block';
            }
            else {
                controls.enabled = false;
                blocker.style.display = 'block';
                message.style.display = 'none';
            }
        };
        document.addEventListener('pointerlockchange', pointerlockchange, false);
        document.addEventListener('mozpointerlockchange', pointerlockchange, false);
        document.addEventListener('webkitpointerlockchange', pointerlockchange, false);
        document.addEventListener('pointerlockerror', pointerlockerror, false);
        document.addEventListener('mozpointerlockerror', pointerlockerror, false);
        document.addEventListener('webkitpointerlockerror', pointerlockerror, false);
        if (/Firefox/i.test(navigator.userAgent)) {
            var fullscreenchange = function (event) {
                if (_doc_1.fullscreenElement === _body_1 || _doc_1.mozFullscreenElement === _body_1 || _doc_1.mozFullScreenElement === _body_1) {
                    _doc_1.removeEventListener('fullscreenchange', fullscreenchange);
                    _doc_1.removeEventListener('mozfullscreenchange', fullscreenchange);
                    _body_1.requestPointerLock();
                    controls.enabled = true;
                }
                else
                    controls.enabled = false;
            };
            _doc_1.addEventListener('fullscreenchange', fullscreenchange, false);
            _doc_1.addEventListener('mozfullscreenchange', fullscreenchange, false);
            _body_1.requestFullscreen = _body_1.requestFullscreen || _body_1.mozRequestFullscreen || _body_1.mozRequestFullScreen || _body_1.webkitRequestFullscreen;
            _body_1.requestFullscreen();
        }
        else {
            _body_1.requestPointerLock();
        }
    }
    else {
        pointerlockerror(null);
    }
}
//-------------------------------------------------------------------
var MouseShooter = /** @class */ (function () {
    function MouseShooter(radius, mass, factory, camera) {
        this.pos = new THREE.Vector3();
        this.screenCenter = new THREE.Vector2(0, 0);
        this.raycaster = new THREE.Raycaster();
        this.quat = new THREE.Quaternion(0, 0, 0, 1);
        this.ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });
        this.radius = radius;
        this.mass = mass;
        this.factory = factory;
        this.camera = camera;
    }
    MouseShooter.prototype.shoot = function () {
        this.raycaster.setFromCamera(this.screenCenter, this.camera);
        this.pos.copy(this.raycaster.ray.direction);
        this.pos.add(this.raycaster.ray.origin);
        var ball = this.factory.createSphere(this.radius, this.mass, this.pos, this.quat, this.ballMaterial);
        ball.castShadow = true;
        ball.receiveShadow = true;
        var body = ball.userData.physicsBody;
        this.pos.copy(this.raycaster.ray.direction);
        this.pos.multiplyScalar(160);
        body.setLinearVelocity(new Ammo.btVector3(this.pos.x, this.pos.y, this.pos.z));
    };
    return MouseShooter;
}());
//-------------------------------------------------------------------
window.onload = function () {
    var elem = document.getElementById('container');
    elem.innerHTML = "";
    if (!Detector.webgl) {
        Detector.addGetWebGLMessage();
    }
    else {
        var engine_1 = new Engine(elem, 0xBFD1E5);
        engine_1.enableShadows();
        // CAMERA
        {
            var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.2, 1000);
            engine_1.setCamera(camera);
        }
        // DIRECTIONAL LIGHT
        {
            var light = new THREE.DirectionalLight(0xffffff, 1);
            light.castShadow = true;
            light.position.set(50, 100, 50);
            var d = 100;
            light.shadow.camera.left = -d;
            light.shadow.camera.right = d;
            light.shadow.camera.top = d;
            light.shadow.camera.bottom = -d;
            light.shadow.camera.near = 2;
            light.shadow.camera.far = 500;
            light.shadow.mapSize.x = 4096;
            light.shadow.mapSize.y = 4096;
            engine_1.addLight(light);
        }
        // AMBIENT LIGHT
        {
            var ambientLight = new THREE.AmbientLight(0x606060);
            engine_1.addLight(ambientLight);
        }
        var factory_1 = new ShapeFactory(engine_1);
        var textureLoader = new THREE.TextureLoader();
        var groundScaleZ = 100;
        var groundRotationX = 0.15;
        // GROUND
        {
            var ground_1 = factory_1.createParalellepiped(100, 1, groundScaleZ, 0, new THREE.Vector3(0, -0.5, 0), new THREE.Quaternion(groundRotationX, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
            var wallLeft_1 = factory_1.createParalellepiped(2, 50, 90, 0, new THREE.Vector3(-51, 0, 0), new THREE.Quaternion(0, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
            var wallRight_1 = factory_1.createParalellepiped(2, 50, 90, 0, new THREE.Vector3(51, 0, 0), new THREE.Quaternion(0, 0, 0, 1), new THREE.MeshPhongMaterial({ color: 0xFFFFFF }));
            ground_1.castShadow =
                ground_1.receiveShadow =
                    wallLeft_1.castShadow = true;
            wallLeft_1.receiveShadow =
                wallRight_1.castShadow =
                    wallRight_1.receiveShadow = true;
            textureLoader.load("img/cement.jpg", function (texture) {
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(5, 5);
                //@ts-ignore
                ground_1.material.map = texture;
                ground_1.material.needsUpdate = true;
                //@ts-ignore
                wallLeft_1.material.map = texture;
                wallLeft_1.material.needsUpdate = true;
                //@ts-ignore
                wallRight_1.material.map = texture;
                wallRight_1.material.needsUpdate = true;
            });
            engine_1.addObject(ground_1);
            engine_1.addObject(wallLeft_1);
            engine_1.addObject(wallRight_1);
        }
        var _material_1 = new THREE.MeshPhongMaterial({ color: 0xFFFFFF });
        textureLoader.load("img/brick.jpg", function (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            _material_1.map = texture;
            _material_1.needsUpdate = true;
        });
        var _dropCount_1 = 0;
        setInterval(function () {
            _dropCount_1++;
            if (_dropCount_1 % 5) {
                dropBrick(_material_1);
            }
            else {
                dropSephere(_material_1);
            }
        }, 2000);
        function dropBrick(material) {
            if (!controls_1.enabled)
                return;
            var _x = 26 * Math.random() * (Math.random() > .5 ? -1 : 1);
            // let _z = -50 * Math.random();
            var _pos = new THREE.Vector3(_x, 15, -30);
            factory_1.createParalellepiped(6, 6, 6, 30, _pos, new THREE.Quaternion(0, 0, 0, 1), material);
        }
        function dropSephere(material) {
            if (!controls_1.enabled)
                return;
            var _x = 50 * Math.random() * (Math.random() > .5 ? -1 : 1);
            var _z = -50 * Math.random();
            var _pos = new THREE.Vector3(_x, 15, _z);
            factory_1.createSphere(10, 60, _pos, new THREE.Quaternion(0, 0, 0, 1), material);
        }
        // CONTROLS
        var controls_1 = new CameraMoveControls(engine_1.getCamera());
        controls_1.getObject().position.set(0, -10, 90);
        controls_1.getObject().rotation.y = 0;
        controls_1.setPitchRotationX(0);
        engine_1.addObject(controls_1.getObject());
        // MOUSE SHOOTER
        var mouseShooter_1 = new MouseShooter(1.2, 10, factory_1, engine_1.getCamera());
        // HANDLE MOUSE CLICK
        var isMouseDowning = false;
        window.addEventListener('mousedown', function (event) {
            isMouseDowning = true;
            var element = event.target;
            if (element.nodeName == 'A')
                return;
            else if (!controls_1.enabled) {
                lockPointer(controls_1);
            }
        }, false);
        window.addEventListener('mouseup', function (event) {
            isMouseDowning = false;
        }, false);
        var edgeZ = Math.cos(groundRotationX) * groundScaleZ;
        /* function checkIsBeyondEdge() {
            return function (rigidBodies) {
                const len = rigidBodies.length;
                for (let i = 0; i < len; i++) {
                    var objThree = this.rigidBodies[i];
                    if (objThree.position.z > edgeZ) {
                        controls.enabled = false;
                        lockPointer(controls);
                    }
                }
            }
        } */
        // START THE ENGINE
        var duration = 0;
        function animate() {
            requestAnimationFrame(animate);
            // const deltaTime = engine.update(controls.enabled, checkIsBeyondEdge().bind(this));
            var deltaTime = engine_1.update(controls_1.enabled);
            duration += deltaTime;
            controls_1.update(deltaTime);
            if (isMouseDowning && duration > 0.2) {
                duration = 0;
                mouseShooter_1.shoot();
            }
        }
        animate();
    }
};
